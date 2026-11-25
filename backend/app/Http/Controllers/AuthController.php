<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Moderation\ModerationWorkflow;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private ModerationWorkflow $moderation) {}

    public function session(Request $request, int $status = 200): JsonResponse
    {
        $user = $request->user('web');

        return response()->json([
            'user' => $user ? [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'admin' => $this->moderation->isAdmin($user),
            ] : null,
            'googleEnabled' => GoogleAuthController::enabled(),
        ], $status)->header('Cache-Control', 'no-store, private');
    }

    public function login(Request $request): JsonResponse
    {
        abort_if($request->user('web'), 409, 'Bạn đã đăng nhập. Hãy tải lại phiên làm việc.');
        $credentials = $this->validateCredentials($request);

        if (! Auth::guard('web')->attempt($credentials)) {
            throw ValidationException::withMessages(['email' => 'Email hoặc mật khẩu chưa đúng.']);
        }

        return $this->session($request);
    }

    public function register(Request $request): JsonResponse
    {
        abort_if($request->user('web'), 409, 'Bạn đã đăng nhập. Hãy tải lại phiên làm việc.');
        $credentials = $this->validateCredentials($request, registering: true);

        try {
            $user = User::query()->create($credentials);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => 'Email này đã được sử dụng.']);
        }

        Auth::guard('web')->login($user);

        return $this->session($request, 201);
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    private function validateCredentials(Request $request, bool $registering = false): array
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => Str::lower(trim($request->input('email')))]);
        }

        $passwordBytes = function (string $attribute, string $value, Closure $fail): void {
            if (strlen($value) > 72 || str_contains($value, "\0")) {
                $fail('Mật khẩu phải có tối đa 72 byte và không chứa ký tự null.');
            }
        };
        $rules = [
            'email' => ['bail', 'required', 'string', 'max:254', 'email:rfc'],
            'password' => ['bail', 'required', 'string', $passwordBytes],
        ];

        if ($registering) {
            $rules['name'] = ['bail', 'required', 'string', 'max:100'];
            $rules['email'][] = 'unique:users,email';
            $rules['password'] = [...$rules['password'], 'min:8', 'confirmed'];
        }

        return $request->validate($rules, [
            'name.required' => 'Hãy nhập họ và tên.',
            'name.max' => 'Họ và tên chỉ được dài tối đa 100 ký tự.',
            'email.required' => 'Hãy nhập email.',
            'email.email' => 'Email chưa đúng định dạng.',
            'email.max' => 'Email chỉ được dài tối đa 254 ký tự.',
            'email.unique' => 'Email này đã được sử dụng.',
            'password.required' => 'Hãy nhập mật khẩu.',
            'password.min' => 'Mật khẩu phải có ít nhất 8 ký tự.',
            'password.confirmed' => 'Xác nhận mật khẩu chưa khớp.',
        ]);
    }
}
