<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SaveItineraryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $money = ['nullable', 'integer', 'min:0', 'max:9007199254740991'];

        return [
            'name' => ['required', 'string', 'max:80'],
            'date' => ['present', 'nullable', 'date_format:Y-m-d'],
            'endDate' => ['nullable', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:500'],
            'budget' => $money,
            'cover' => ['nullable', 'string', 'max:1398136', function ($attribute, $value, $fail) {
                if (! preg_match('~^data:image/(jpeg|png|webp);base64,([a-z0-9+/]+={0,2})$~i', $value, $m)) {
                    $fail('Ảnh bìa phải là JPG, PNG hoặc WebP.');

                    return;
                }
                $image = base64_decode($m[2], true);
                $info = $image === false ? false : @getimagesizefromstring($image);
                if ($image === false || strlen($image) > 1024 * 1024 || ! $info || $info['mime'] !== 'image/'.strtolower($m[1])) {
                    $fail('Ảnh bìa không hợp lệ hoặc vượt 1 MB.');
                }
            }],
            'source' => ['sometimes', Rule::in(['manual', 'ai-demo'])],
            'version' => [$this->isMethod('put') ? 'required' : 'sometimes', 'integer', 'min:1'],
            'points' => ['required', 'array', 'list', 'min:1', 'max:5'],
            'points.*.placeId' => ['required', 'string', 'max:80', 'distinct:strict', 'regex:~^(?:osm:(?:node|way|relation)/[0-9]+|tg-(?:local|demo|place)-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$~'],
            'points.*.time' => ['required', 'regex:/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/'],
            'points.*.date' => ['nullable', 'date_format:Y-m-d'],
            'points.*.note' => ['nullable', 'string', 'max:180'],
            'points.*.estimatedCost' => $money,
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            $start = $this->input('date');
            $end = $this->input('endDate') ?: $start;
            if ($this->input('endDate') && (! $start || $end < $start)) {
                $validator->errors()->add('endDate', 'Ngày kết thúc phải từ ngày bắt đầu trở đi.');
            }
            foreach ((array) $this->input('points', []) as $i => $point) {
                $day = is_array($point) ? ($point['date'] ?? null) : null;
                if ($day && (! $start || $day < $start || $day > $end)) {
                    $validator->errors()->add("points.$i.date", 'Ngày ghé phải nằm trong khoảng ngày chuyến đi.');
                }
            }
        }];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nhập tên chuyến đi.',
            'name.max' => 'Tên chuyến đi tối đa 80 ký tự.',
            'note.max' => 'Ghi chú chuyến đi tối đa 500 ký tự.',
            'date.present' => 'Gửi ngày chuyến đi; có thể để trống khi chưa chọn ngày.',
            '*.date_format' => 'Chọn ngày hợp lệ theo dạng năm-tháng-ngày.',
            'points.required' => 'Chọn từ 1 đến 5 điểm ghé.',
            'points.array' => 'Danh sách điểm ghé không hợp lệ.',
            'points.list' => 'Danh sách điểm ghé không hợp lệ.',
            'points.min' => 'Chọn ít nhất một điểm ghé.',
            'points.max' => 'Mỗi lịch trình tối đa 5 điểm ghé.',
            'points.*.placeId.required' => 'Chọn địa điểm cho từng điểm ghé.',
            'points.*.placeId.distinct' => 'Mỗi địa điểm chỉ được thêm một lần.',
            'points.*.placeId.regex' => 'Mã địa điểm không hợp lệ.',
            'points.*.time.required' => 'Nhập giờ ghé cho từng địa điểm.',
            'points.*.time.regex' => 'Giờ ghé phải từ 00:00 đến 23:59.',
            'points.*.note.max' => 'Ghi chú mỗi điểm ghé tối đa 180 ký tự.',
            'points.*.estimatedCost.integer' => 'Chi phí dự kiến phải là số nguyên đồng.',
            'points.*.estimatedCost.min' => 'Chi phí dự kiến không được âm.',
            'budget.integer' => 'Ngân sách phải là số nguyên đồng.',
            'budget.min' => 'Ngân sách không được âm.',
            'version.required' => 'Tải lại lịch trình trước khi chỉnh sửa.',
            'source.in' => 'Loại lịch trình chưa được hỗ trợ.',
        ];
    }
}
