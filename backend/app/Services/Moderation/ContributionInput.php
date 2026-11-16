<?php

namespace App\Services\Moderation;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContributionInput
{
    public function validate(array $input): array
    {
        $data = Validator::make($input, [
            'kind' => ['required', Rule::in(['new', 'update', 'claim', 'report'])],
            'placeId' => ['nullable', 'string', 'max:80'],
            'context' => ['sometimes', Rule::in(['user', 'owner'])],
            'reason' => ['required', 'string', 'max:600'],
            'relationship' => ['required_if:kind,claim', Rule::in(['owner', 'representative'])],
            'evidence' => ['required_if:kind,claim', 'string', 'max:600'],
            'agreement' => [Rule::excludeIf(($input['kind'] ?? '') !== 'claim'), 'required', 'accepted'],
            'hcmConfirmed' => ['sometimes', 'boolean'],
            'expectedRevision' => ['nullable', 'string', 'size:64'],
            'change' => ['sometimes', Rule::in(['details', 'hours', 'temporary-move', 'permanent-move', 'pause', 'closed'])],
            'effectiveFrom' => ['nullable', 'string', 'max:40'],
            'effectiveUntil' => ['nullable', 'string', 'max:40'],
            'reviewId' => ['required_if:kind,report', 'integer', 'min:1'],
            'reviewVersion' => ['required_if:kind,report', 'string', 'max:40'],
            'photoId' => ['nullable', 'integer', 'min:1'],
            'patch' => ['required_if:kind,new', 'array:name,area,category,description,hours,products,lat,lng,price,photo'],
            'patch.name' => ['sometimes', 'required', 'string', 'max:255'],
            'patch.area' => ['sometimes', 'required', 'string', 'max:600'],
            'patch.category' => ['sometimes', Rule::in(['coffee', 'food', 'nature', 'culture', 'drink', 'lodging'])],
            'patch.description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'patch.hours' => ['sometimes', 'nullable', 'string', 'max:600'],
            'patch.products' => ['sometimes', 'array', 'max:20'],
            'patch.products.*' => ['required', 'string', 'max:100'],
            'patch.lat' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'patch.lng' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'patch.price' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:999999999999'],
            'patch.photo' => ['sometimes', 'array:dataUrl,credit,rightsConfirmed'],
            'patch.photo.dataUrl' => ['required_with:patch.photo', 'string', 'max:6990600'],
            'patch.photo.credit' => ['required_with:patch.photo', 'string', 'max:255'],
            'patch.photo.rightsConfirmed' => [Rule::excludeIf(! isset($input['patch']['photo'])), 'required', 'accepted'],
        ])->validate();
        $kind = $data['kind'];
        $data['reason'] = trim($data['reason']);
        $patch = $data['patch'] ?? [];
        if ($kind !== 'new' && empty($data['placeId'])) {
            $this->invalid('placeId', 'Chọn địa điểm.');
        }
        if (in_array($kind, ['new', 'update'], true)) {
            if ($kind === 'new') {
                foreach (['name', 'area', 'category'] as $field) {
                    if (empty($patch[$field])) {
                        $this->invalid('patch.'.$field, 'Thông tin bắt buộc.');
                    }
                }
            }
            $coordinates = array_key_exists('lat', $patch) || array_key_exists('lng', $patch);
            if ($coordinates && (! array_key_exists('lat', $patch) || ! array_key_exists('lng', $patch) || ($patch['lat'] === null) !== ($patch['lng'] === null))) {
                $this->invalid('patch.lat', 'Nhập đủ tọa độ hoặc để trống cả hai.');
            }
            if (($kind === 'new' || $coordinates) && ($data['hcmConfirmed'] ?? false) !== true) {
                $this->invalid('hcmConfirmed', 'Xác nhận địa điểm thuộc TP. Hồ Chí Minh.');
            }
            if ($kind === 'update' && empty($data['expectedRevision'])) {
                $this->invalid('expectedRevision', 'Mở lại phiên bản hiện tại của địa điểm.');
            }
            $change = $kind === 'new' ? 'details' : ($data['change'] ?? 'details');
            if (! $patch && ! in_array($change, ['pause', 'closed'], true)) {
                $this->invalid('patch', 'Chọn ít nhất một thông tin thay đổi.');
            }
            if (in_array($change, ['temporary-move', 'permanent-move'], true) && (! isset($patch['lat'], $patch['lng']))) {
                $this->invalid('patch.lat', 'Nhập tọa độ mới khi chuyển địa điểm.');
            }
            if ($change === 'hours' && ! array_key_exists('hours', $patch)) {
                $this->invalid('patch.hours', 'Nhập giờ bán.');
            }
            $data['change'] = $change;
            try {
                $data['effectiveFrom'] = WorkflowRules::date($data['effectiveFrom'] ?? null);
                $data['effectiveUntil'] = WorkflowRules::date($data['effectiveUntil'] ?? null);
            } catch (\InvalidArgumentException) {
                $this->invalid('effectiveFrom', 'Thời điểm không hợp lệ.');
            }
            if (($data['effectiveUntil'] && (! in_array($change, ['temporary-move', 'pause'], true) || $data['effectiveUntil'] <= max(now()->toISOString(), $data['effectiveFrom'] ?? ''))) ||
                ($change === 'temporary-move' && ! $data['effectiveUntil'])) {
                $this->invalid('effectiveUntil', 'Thời hạn thay đổi tạm không hợp lệ.');
            }
            if (isset($patch['photo'])) {
                $this->photo($patch['photo']);
            }
        }

        return $data;
    }

    private function photo(array $photo): void
    {
        if (! preg_match('#^data:image/(jpeg|png|webp);base64,(.+)$#sD', $photo['dataUrl'], $parts)) {
            $this->invalid('patch.photo', 'Ảnh không hợp lệ.');
        }
        $bytes = base64_decode($parts[2], true);
        $size = $bytes === false ? false : @getimagesizefromstring($bytes);
        if ($bytes === false || strlen($bytes) > 5 * 1024 * 1024 || ! $size || $size['mime'] !== 'image/'.$parts[1] || $size[0] * $size[1] > 60000000) {
            $this->invalid('patch.photo', 'Ảnh phải là JPG, PNG hoặc WebP thật, tối đa 5 MB và 60 triệu pixel.');
        }
    }

    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
