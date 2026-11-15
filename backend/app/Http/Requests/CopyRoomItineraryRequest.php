<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CopyRoomItineraryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'roomCode' => ['required', 'string', 'regex:/^[A-F0-9]{8}$/'],
            'roomRevision' => ['required', 'integer', 'min:1', 'max:4294967295'],
        ];
    }

    public function messages(): array
    {
        return [
            'roomCode.regex' => 'Mã phòng không hợp lệ.',
            'roomRevision.required' => 'Tải lại phòng trước khi lưu lịch trình cá nhân.',
            'roomRevision.integer' => 'Phiên bản phòng không hợp lệ.',
        ];
    }
}
