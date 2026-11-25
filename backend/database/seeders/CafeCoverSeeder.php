<?php

namespace Database\Seeders;

use App\Models\Place;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CafeCoverSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = json_decode(file_get_contents(base_path('../frontend/public/data/osm-photo-sources.json')), true, flags: JSON_THROW_ON_ERROR);
        $covers = array_column($catalog['images'], null, 'placeId');
        $osmIds = ['osm:node/4928829323', 'osm:way/1275902196'];

        DB::transaction(function () use ($osmIds, $covers): void {
            foreach ($osmIds as $id) {
                $place = Place::query()->where('source', 'osm')->where('public_id', $id)->lockForUpdate()->first();
                if (! $place || $place->image) {
                    continue;
                }

                $photo = $covers[$id];
                $place->update([
                    'image' => $photo['path'],
                    'images' => array_values(array_unique([$photo['path'], ...($place->images ?? [])])),
                    'photo_credit' => $photo['title'].' · '.$photo['credit'],
                    'photo_source' => ['url' => $photo['sourcePage'], 'license' => $photo['license'], 'licenseUrl' => $photo['licenseUrl']],
                    'source_metadata' => [...($place->source_metadata ?? []), 'photo' => $photo],
                ]);
            }

            $cityGardenId = 'tg-place-3935f1c8-5293-4f3f-9468-4d92b2bc3ff5';
            $cover = '/images/cafes/city-garden-truong-cong-dinh.webp';
            Place::query()->firstOrCreate(['public_id' => $cityGardenId], [
                'source' => 'travelgo',
                'source_id' => $cityGardenId,
                'name' => 'City Garden Cafe',
                'city' => 'hcm',
                'category' => 'coffee',
                'area' => '9 Trương Công Định, Phường Tân Bình, TP.HCM',
                'source_district' => 'Quận Tân Bình',
                'description' => 'Quán cà phê sân vườn trên đường Trương Công Định.',
                'lat' => 10.79789,
                'lng' => 106.64163,
                'image' => $cover,
                'images' => [$cover],
                'photo_credit' => 'Cafe City Garden Tân Bình · Phương Huy · Wikimedia Commons · CC BY-SA 4.0 (ảnh năm 2018; đã chuyển WebP)',
                'photo_source' => [
                    'url' => 'https://commons.wikimedia.org/wiki/File:Cafe_City_Garden_T%C3%A2n_B%C3%ACnh_ng%C3%A0y_31_th%C3%A1ng_12_n%C4%83m_2018_(1).jpg',
                    'license' => 'CC BY-SA 4.0',
                    'licenseUrl' => 'https://creativecommons.org/licenses/by-sa/4.0/',
                ],
                'source_url' => 'https://www.momo.vn/page/9853139',
                'source_label' => 'Hồ sơ City Garden Cafe trên MoMo',
                'source_license' => 'Thông tin địa điểm từ nguồn công khai',
                'source_metadata' => [
                    'coordinatesSource' => 'https://riviu.vn/city-garden-cafe-truong-cong-dinh',
                    'checkedDate' => '2026-11-25',
                ],
                'reference_only' => true,
            ]);
        });
    }
}
