<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

class ReviewImages
{
    public function decode(string $value, int $index): array
    {
        $error = ['photos.'.$index => 'Chọn ảnh JPG, PNG hoặc WebP hợp lệ, tối đa 5 MB.'];
        if (! preg_match('~\Adata:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})\z~D', $value, $match)) {
            throw ValidationException::withMessages($error);
        }

        $bytes = base64_decode($match[2], true);
        if ($bytes === false || strlen($bytes) === 0 || strlen($bytes) > 5 * 1024 * 1024) {
            throw ValidationException::withMessages($error);
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $size = @getimagesizefromstring($bytes);
        if (! $size || ! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) ||
            $mime !== $match[1] || ($size['mime'] ?? null) !== $mime ||
            $size[0] <= 0 || $size[1] <= 0 || $size[0] * $size[1] > 60_000_000) {
            throw ValidationException::withMessages($error);
        }

        return ['bytes' => $bytes, 'mime' => $mime, 'sha256' => hash('sha256', $bytes), 'extension' => ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime]];
    }
}
