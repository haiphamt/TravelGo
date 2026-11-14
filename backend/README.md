# Backend TravelGo

Khung Laravel 13 dùng MySQL cho các nhánh backend của TravelGo. Route `GET /up` kiểm tra ứng dụng khởi động và trả HTTP 200 khi Laravel hoạt động. Migration quản lý bảng `users` và các bảng hạ tầng Laravel cho session, cache, queue và token đặt lại mật khẩu.

## Yêu cầu

- PHP 8.3 trở lên theo yêu cầu của Laravel 13. Bật `pdo_mysql`, `mbstring`, `openssl`, `fileinfo` và các extension XML của PHPUnit, gồm `dom`, `xml`, `xmlwriter`.
- Composer 2 và MySQL 8.4. Kiểm tra bằng `php -v`, `php -m`, `composer --version` và `mysql --version` nếu có MySQL CLI.

## Tạo cơ sở dữ liệu cục bộ

Dùng tài khoản quản trị MySQL để chạy đoạn SQL một lần trên máy phát triển. Thay hai mật khẩu mẫu bằng mật khẩu riêng.

```sql
CREATE DATABASE travelgo_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE travelgo_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'travelgo_dev'@'127.0.0.1' IDENTIFIED BY '<MAT_KHAU_DEV>';
CREATE USER 'travelgo_test'@'127.0.0.1' IDENTIFIED BY '<MAT_KHAU_TEST>';
GRANT ALL PRIVILEGES ON `travelgo\_dev`.* TO 'travelgo_dev'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `travelgo\_test`.* TO 'travelgo_test'@'127.0.0.1';
```

## Cài và chạy từ bản clone

Chạy từ thư mục gốc của repo.

```sh
cd backend
composer install
composer check-platform-reqs
cp .env.example .env
```

Trong PowerShell, dùng `Copy-Item .env.example .env` cho lệnh sao chép. Chỉ tạo `.env` và khóa ứng dụng khi thiết lập môi trường mới. Điền `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` và `DB_PASSWORD` theo MySQL cục bộ. Mặc định ứng dụng dùng `travelgo_dev`.

```sh
php artisan key:generate
php artisan config:clear
php artisan migrate
php artisan migrate:status
php artisan db:seed
php artisan db:seed
php artisan serve --host=127.0.0.1 --port=8000
```

Từ terminal khác, chạy `curl -i http://127.0.0.1:8000/up` hoặc `curl.exe -i http://127.0.0.1:8000/up` trên Windows. Kết quả mong đợi là HTTP 200. Route này kiểm tra ứng dụng. Kết nối và schema MySQL được xác minh qua migration và các test cơ sở dữ liệu.

Seeder tạo hai tài khoản tự tạo có nhãn TravelGo Demo. Các email dùng miền `example.invalid` và mật khẩu ngẫu nhiên được băm. Chạy lại seed giữ nguyên ID của hai tài khoản. Có thể kiểm tra sau mỗi lượt bằng truy vấn sau trên `travelgo_dev`.

```sql
SELECT id, email FROM users
WHERE email IN ('travelgo-demo-1@example.invalid', 'travelgo-demo-2@example.invalid')
ORDER BY id;
```

## PHPUnit trên MySQL

Tạo `.env.testing` cục bộ từ `.env` rồi đặt `APP_ENV=testing`, `DB_CONNECTION=mysql`, `DB_DATABASE=travelgo_test`, `DB_USERNAME=travelgo_test` và mật khẩu test tương ứng. Dùng đúng host và port của MySQL cục bộ. Nếu shell đang đặt biến `DB_*` hoặc `DB_URL`, bỏ các giá trị ghi đè trước khi chạy.

```sh
php artisan config:clear
php artisan test
```

Bộ test kiểm tra HTTP 200, kiểu khóa tài khoản trên MySQL và việc seed hai lần giữ nguyên hai bản ghi. PHPUnit cố định driver MySQL và schema `travelgo_test`. Test cơ sở dữ liệu dùng `RefreshDatabase`, có thể tạo lại các bảng trong schema đó. Trước khi chạy migration, bộ test còn xác minh driver và tên database thực tế trên kết nối ghi. Giữ `travelgo_test` dành riêng cho test và cấp quyền tài khoản test chỉ trên schema này.

## Hợp đồng dữ liệu dùng chung

- `users.id` là `BIGINT UNSIGNED AUTO_INCREMENT` trên MySQL, khai báo bằng `$table->id()`. Khi thêm khóa ngoại nghiệp vụ, dùng `$table->foreignId('user_id')->constrained('users')` với tên cột phù hợp. `sessions.user_id` dùng cùng kiểu và có index theo migration hạ tầng Laravel.
- Tuấn Hải phụ trách đăng nhập email/Google và liên kết mã định danh Google với ID nội bộ. Cách lưu vai trò và ánh xạ `user`, `owner`, `admin` cần nhóm thống nhất.
- Thống nhất ID nội bộ và mã địa điểm công khai, ánh xạ nguồn, quy tắc duy nhất và trường có thể thiếu với người phụ trách API địa điểm. Fixture địa điểm và nhập danh mục thuộc PR dữ liệu tiếp theo.
- Giữ `.env`, `.env.testing` và `vendor/` ở máy cục bộ. Chia sẻ tên biến cấu hình qua `.env.example`.

Khung dựa trên [Laravel application skeleton theo giấy phép MIT](https://github.com/laravel/laravel/tree/a255d7688770af9713daff1439c47ff9bc6abd47). Hợp đồng tài khoản theo [hướng dẫn bàn giao TravelGo](https://github.com/haiphamt/TravelGo/blob/54c599b/docs/BACKEND_FOUNDATION_TASK.md).
