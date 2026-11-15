<?php

namespace App\Services\Moderation;

use App\Models\Contribution;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ModerationWorkflow
{
    public function __construct(private ContributionInput $input, private ModerationCatalog $catalog) {}

    public function isAdmin(User $user): bool
    {
        // No role comes from the request. Tuấn Hải owns the production role column/adapter.
        return $user->getAttribute('role') === 'admin';
    }

    public function manages(User $user, int $placeId): bool
    {
        return DB::table('ownership_grants')->where('place_id', $placeId)->where('user_id', $user->id)->whereNull('revoked_at')->exists();
    }

    public function submit(User $user, array $input, ?Contribution $prior = null, ?int $version = null): Contribution
    {
        $payload = $this->input->validate($input);

        return DB::transaction(function () use ($user, $payload, $prior, $version) {
            // All paths lock place before contribution, including revocation and resubmission.
            $place = $payload['kind'] === 'new' ? null : $this->catalog->lock($payload['placeId'], $payload['kind'] === 'update');
            $item = $prior ? Contribution::query()->lockForUpdate()->findOrFail($prior->id) : new Contribution;
            if ($prior) {
                abort_unless($item->user_id === $user->id, 403);
                $this->version($item, $version);
                abort_unless(WorkflowRules::transition($item->kind, $item->status, 'pending'), 409, 'Yêu cầu không thể gửi lại.');
                abort_unless($payload['kind'] === $item->kind && ($payload['kind'] === 'new' || $payload['placeId'] === $item->public_place_id), 422, 'Không đổi loại hoặc địa điểm khi bổ sung.');
            }
            $actor = $prior ? $item->actor : (($payload['kind'] === 'claim' || ($payload['context'] ?? '') === 'owner') ? 'owner' : 'user');
            if ($actor === 'owner' && $payload['kind'] !== 'claim') {
                abort_unless($place && $this->manages($user, $place->id), 403, 'Không có quyền quản lý địa điểm này.');
            }
            abort_if($payload['kind'] === 'new' && $actor !== 'user', 422, 'Gửi địa điểm mới từ Đóng góp của tôi.');
            if ($payload['kind'] === 'update') {
                abort_unless(hash_equals($this->catalog->revision($place), $payload['expectedRevision']), 409, 'Địa điểm đã thay đổi.');
            }
            $snapshot = $place ? $this->catalog->snapshot($place) : null;
            if ($payload['kind'] === 'claim') {
                abort_if(DB::table('ownership_grants')->where('place_id', $place->id)->whereNull('revoked_at')->exists(), 409, 'Địa điểm đã được cấp quyền.');
                abort_if(Contribution::query()->where('place_id', $place->id)->where('kind', 'claim')->whereIn('status', ['pending', 'needs-info'])
                    ->when($prior, fn ($query) => $query->whereKeyNot($item->id))->exists(), 409, 'Có yêu cầu quản lý đang xử lý.');
            }
            if ($payload['kind'] === 'report') {
                $review = $this->review($place->id, $payload['reviewId'], $payload['reviewVersion'], $payload['photoId'] ?? null);
                if ($prior) {
                    abort_unless($item->payload['reviewId'] == $payload['reviewId'] && $item->payload['reviewVersion'] === $payload['reviewVersion'] &&
                        ($item->payload['photoId'] ?? null) === ($payload['photoId'] ?? null), 409, 'Không đổi nội dung được báo cáo.');
                }
                abort_if(Contribution::query()->where('place_id', $place->id)->where('kind', 'report')->whereIn('status', ['pending', 'needs-info'])
                    ->when($prior, fn ($query) => $query->whereKeyNot($item->id))->get()->contains(fn ($report) => $report->payload['reviewId'] == $payload['reviewId'] && $report->payload['reviewVersion'] === $payload['reviewVersion'] &&
                        ($report->payload['photoId'] ?? null) === ($payload['photoId'] ?? null)), 409, 'Báo cáo này đang được xử lý.');
                $payload['reportSnapshot'] = ['rating' => $review->rating, 'text' => $review->text, 'visitedOn' => $review->visited_on, 'updatedAt' => $payload['reviewVersion']];
            }
            $item->fill([
                'id' => $prior ? $item->id : (string) Str::uuid(), 'user_id' => $user->id, 'place_id' => $place?->id,
                'public_place_id' => $prior ? $item->public_place_id : ($place?->public_id ?? 'tg-place-'.Str::uuid()),
                'kind' => $payload['kind'], 'actor' => $actor, 'status' => 'pending', 'version' => $prior ? $item->version + 1 : 1,
                'payload' => $payload, 'snapshot' => $snapshot, 'base_revision' => $place ? $this->catalog->revision($place) : null,
            ])->save();
            $this->event($item, $user, $actor, $payload['reason']);

            return $item;
        }, 3);
    }

    public function change(User $user, Contribution $request, int $version, string $decision, string $reason, ?string $reportAction = null): Contribution
    {
        return DB::transaction(function () use ($user, $request, $version, $decision, $reason, $reportAction) {
            $place = $request->place_id ? $this->catalog->lock($request->public_place_id, $decision === 'approved' && $request->kind === 'update') : null;
            $item = Contribution::query()->lockForUpdate()->findOrFail($request->id);
            $admin = $decision !== 'withdrawn';
            abort_unless($admin ? $this->isAdmin($user) : $item->user_id === $user->id, 403);
            $this->version($item, $version);
            abort_unless(WorkflowRules::transition($item->kind, $item->status, $decision), 409, 'Trạng thái không còn cho phép thao tác.');
            if ($decision === 'approved') {
                if ($item->actor === 'owner' && $item->kind !== 'claim') {
                    abort_unless($place && $this->manages(User::findOrFail($item->user_id), $place->id), 403, 'Người gửi đã bị thu hồi quyền.');
                }
                if (in_array($item->kind, ['new', 'update'], true)) {
                    $this->catalog->approve($item, $place);
                } elseif ($item->kind === 'claim') {
                    abort_unless($place, 409, 'Địa điểm không còn tồn tại.');
                    abort_if(DB::table('ownership_grants')->where('place_id', $place->id)->whereNull('revoked_at')->exists(), 409, 'Quyền quản lý đã được cấp.');
                    DB::table('ownership_grants')->updateOrInsert(['place_id' => $place->id], [
                        'user_id' => $item->user_id, 'contribution_id' => $item->id, 'revoked_at' => null, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                } elseif ($item->kind === 'report') {
                    abort_unless($place, 409);
                    $this->review($place->id, $item->payload['reviewId'], $item->payload['reviewVersion'], $item->payload['photoId'] ?? null);
                    abort_unless(in_array($reportAction, ['keep', 'hide-photo', 'hide-review'], true), 422, 'Chọn cách xử lý báo cáo.');
                    if ($reportAction === 'hide-photo') {
                        abort_unless(isset($item->payload['photoId']), 422, 'Báo cáo không có ảnh cụ thể.');
                        DB::table('review_photos')->where('id', $item->payload['photoId'])->update(['hidden_at' => now()]);
                    } elseif ($reportAction === 'hide-review') {
                        DB::table('reviews')->where('id', $item->payload['reviewId'])->update(['hidden_at' => now()]);
                    }
                    $item->payload = [...$item->payload, 'reportAction' => $reportAction];
                }
                $item->approved_at = now();
            } elseif ($decision === 'revoked') {
                DB::table('ownership_grants')->where('contribution_id', $item->id)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
                $pending = Contribution::query()->where('place_id', $item->place_id)->where('user_id', $item->user_id)->where('actor', 'owner')
                    ->whereIn('status', ['pending', 'needs-info'])->lockForUpdate()->get();
                foreach ($pending as $other) {
                    $other->status = 'rejected';
                    $other->version++;
                    $other->save();
                    $this->event($other, $user, 'admin', 'Quyền quản lý đã bị thu hồi. '.$reason);
                }
            }
            $item->status = $decision;
            $item->version++;
            $item->save();
            $this->event($item, $user, $admin ? 'admin' : $item->actor, $reason);
            if ($item->kind === 'update' && $decision === 'approved') {
                $this->catalog->reconcile($place);
            }

            return $item;
        }, 3);
    }

    public function reply(User $user, int $reviewId, string $version, string $text): void
    {
        DB::transaction(function () use ($user, $reviewId, $version, $text) {
            $record = DB::table('reviews')->find($reviewId);
            abort_unless($record, 404);
            $place = DB::table('places')->where('id', $record->place_id)->lockForUpdate()->first();
            abort_unless($place && $this->manages($user, $place->id), 403);
            $this->review($place->id, $reviewId, $version);
            if ($text === '') {
                DB::table('owner_replies')->where('review_id', $reviewId)->delete();
            } else {
                DB::table('owner_replies')->updateOrInsert(['review_id' => $reviewId], [
                    'user_id' => $user->id, 'review_version' => $version, 'text' => $text, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }, 3);
    }

    public function visibleReply(object $review): ?array
    {
        if ($review->hidden_at !== null) {
            return null;
        }
        $reply = DB::table('owner_replies')->join('ownership_grants', function ($join) use ($review) {
            $join->on('ownership_grants.user_id', '=', 'owner_replies.user_id')->where('ownership_grants.place_id', $review->place_id)->whereNull('revoked_at');
        })->where('review_id', $review->id)->where('review_version', CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString())
            ->first(['owner_replies.text', 'owner_replies.updated_at']);

        return $reply ? ['text' => $reply->text, 'updatedAt' => CarbonImmutable::parse($reply->updated_at, 'UTC')->toISOString()] : null;
    }

    private function review(int $placeId, int $reviewId, string $version, ?int $photoId = null): object
    {
        $review = DB::table('reviews')->where('id', $reviewId)->where('place_id', $placeId)->lockForUpdate()->first();
        abort_unless($review && $review->hidden_at === null && CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString() === $version, 409, 'Đánh giá đã thay đổi hoặc không còn hiển thị.');
        if ($photoId !== null) {
            abort_unless(DB::table('review_photos')->where('id', $photoId)->where('review_id', $reviewId)->whereNull('hidden_at')->lockForUpdate()->exists(), 409, 'Ảnh đã thay đổi hoặc bị ẩn.');
        }

        return $review;
    }

    private function version(Contribution $item, ?int $version): void
    {
        abort_unless($item->version === $version, 409, 'Yêu cầu đã thay đổi. Tải lại trước khi xử lý.');
    }

    private function event(Contribution $item, User $user, string $actor, string $reason): void
    {
        DB::table('moderation_events')->insert([
            'contribution_id' => $item->id, 'user_id' => $user->id, 'actor' => $actor,
            'status' => $item->status, 'reason' => mb_substr($reason, 0, 600), 'version' => $item->version, 'created_at' => now(),
        ]);
    }
}
