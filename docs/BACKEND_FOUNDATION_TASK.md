# TravelGo — Khung backend, MySQL và dữ liệu địa điểm

- **Phụ trách** · Chung Minh Hiếu
- **Nhánh đầu tiên** · `feat/backend-foundation`
- **Mục tiêu** · Thành viên khác có thể clone repo, chạy Laravel, migrate và nạp dữ liệu mẫu vào MySQL, rồi chạy kiểm thử trên máy của mình.

## 1. Mở đúng repo và tạo nhánh

1. Đăng nhập GitHub bằng tài khoản của mình và clone [haiphamt/TravelGo](https://github.com/haiphamt/TravelGo) nếu máy chưa có bản sao. Nếu đã clone, mở thư mục repo đó.
2. Mở **thư mục gốc TravelGo** làm project trong Codex desktop. Tạo chat trong project, chọn chạy trên máy này và chọn **GPT-6.1 Sol Ultra** trong bộ chọn model nếu tài khoản có tùy chọn đó. Mở thư mục gốc để AI thấy cả `rules.md`, `frontend/` và thư mục `backend/` khi được tạo. [Hướng dẫn project và môi trường Codex](https://learn.chatgpt.com/docs/environments/modes)
3. Xem `git status --short`, cập nhật thông tin từ `origin` và xác nhận nhánh tích hợp với nhóm. Mốc bàn giao hiện có là `feat/travelgo-frontend`. Khi nhóm đã đưa frontend vào `main` và chọn `main` làm nhánh tích hợp, lấy `origin/main` làm gốc và chọn `main` là nhánh đích PR.

Dùng các lệnh sau khi clone lần đầu và tạo nhánh từ mốc frontend.

```sh
git clone https://github.com/haiphamt/TravelGo.git
cd TravelGo
git status --short
git fetch origin
git switch -c feat/backend-foundation origin/feat/travelgo-frontend
```

Nếu đã clone, bắt đầu từ `git status --short` ở thư mục gốc. Nếu nhánh `feat/backend-foundation` đã có, chuyển sang nhánh hiện có và kiểm tra nó lấy gốc từ đâu. Nếu PR phân công chưa merge, dùng lệnh sau để đọc hướng dẫn sau khi chạy `git fetch origin`.

```sh
git show origin/docs/update-team-assignments:docs/BACKEND_FOUNDATION_TASK.md
```

Nhánh tài liệu là nơi đọc hướng dẫn. Nhánh làm việc lấy gốc từ nhánh tích hợp của nhóm.

## 2. Chốt dữ liệu dùng chung trước khi tạo migration

Ghi quyết định ngắn vào task hoặc PR để các bạn có thể triển khai song song.

| Trao đổi với | Điểm cần thống nhất |
| --- | --- |
| Tuấn Hải phụ trách đăng nhập | Kiểu `users.id`, bảng tài khoản dùng chung và nơi lưu vai trò. Frontend demo hiện dùng `user`, `owner`, `admin`. Chốt cách ánh xạ rồi dùng trên API và trong fixture. Tuấn Hải phụ trách luồng đăng nhập và dữ liệu liên kết tài khoản Google. |
| Bạn 2 phụ trách API địa điểm | Bảng địa điểm, ID nội bộ nếu cần, mã địa điểm công khai và quan hệ với mã nguồn. Ví dụ, giữ nguyên `osm:node/5922616527` khi gắn một bản ghi OSM với địa điểm frontend. Chốt cách phân biệt các nguồn, ràng buộc chống trùng và các trường có thể `null`. |
| Bạn 3–5 phụ trách lịch trình, phòng và xét duyệt | Chia sẻ kiểu ID tài khoản, mã địa điểm và quy ước khóa ngoại. Người phụ trách từng nghiệp vụ viết migration cho bảng thuộc phần mình. |

Ưu tiên migration Laravel có sẵn cho bảng người dùng. Nếu cần bổ sung cột dùng chung, mỗi thay đổi có một người phụ trách. Phần chưa thống nhất có thể làm tiếp sau khi khung Laravel đã chạy được.

## 3. PR đầu tiên — Khung Laravel có thể chạy và kiểm thử

1. Kiểm tra `php -v`, `composer --version`, `mysql --version` nếu máy có MySQL CLI, và `php -m` để kiểm tra `pdo_mysql`. Chọn phiên bản PHP/Laravel tương thích với máy của nhóm. Khi repo đã có `backend/`, đọc `composer.json` và `composer.lock` rồi sử dụng phiên bản đang khóa.
2. Khởi tạo Laravel trong `backend/` nếu chưa có. Có thể dùng `composer create-project laravel/laravel backend` từ thư mục gốc với ràng buộc phiên bản đã chốt. Chọn bộ PHPUnit để khớp quy tắc nhóm. Commit mã khung, `composer.lock`, migration, factory/seeder, kiểm thử, `backend/.env.example` và `backend/README.md`. Dùng giá trị mẫu trong `.env.example`. Kiểm tra Git bỏ qua `.env`, `.env.testing` và `backend/vendor/`.
3. Cấu hình MySQL cho môi trường phát triển và một database test riêng. Chọn tên rõ ràng, ví dụ `travelgo_dev` và `travelgo_test`. Ghi cách tạo database, biến môi trường cần điền và cách chạy trên máy mới trong `backend/README.md`. Dùng charset hỗ trợ tiếng Việt, ví dụ `utf8mb4`. Kiểm tra cấu hình test thực sự trỏ tới database test trước khi chạy các test reset dữ liệu.
4. Đưa vào các migration dùng chung đã chốt và một số fixture tự tạo có nhãn demo. Factory/seeder cần đủ cho nhóm kiểm thử tài khoản và vài địa điểm cơ bản. Có thể dùng mã cố định cho bản ghi seed để chạy lại mà không sinh trùng. Nếu hợp đồng địa điểm chưa sẵn sàng, ghi rõ phần fixture địa điểm được đưa vào PR dữ liệu tiếp theo.
5. Xác nhận ứng dụng khởi động và route kiểm tra hoạt động trả HTTP 200. Có thể dùng `/up` nếu phiên bản Laravel đã cấu hình route này. Task này bàn giao nền backend. Các API đăng nhập, địa điểm, đánh giá, lịch trình, phòng và xét duyệt thuộc nhánh của người phụ trách tương ứng. Thay đổi của task khung nằm trong `backend/` và cấu hình repo liên quan trực tiếp.

### Kiểm tra trước khi mở PR

Trên môi trường phát triển mới, chạy từ `backend/`. Tạo `.env` từ `.env.example` và điền cấu hình MySQL trước. Chỉ tạo khóa ứng dụng khi thiết lập môi trường mới.

```sh
composer install
composer check-platform-reqs
php artisan key:generate
php artisan migrate
php artisan migrate:status
php artisan db:seed
php artisan db:seed
php artisan test
php artisan serve
```

- Hai lần seed dùng để xác nhận số bản ghi demo ổn định nếu seeder có dữ liệu cố định. Kiểm tra một bản ghi thực tế hoặc chạy test tự động tương ứng để xác nhận.
- Dùng Laravel Feature Test để kiểm tra các hành vi có trong PR, như route kiểm tra hoạt động hoặc migration/seeder có ràng buộc mới. Tái tạo database test trong bộ test khi phù hợp. Kiểm tra migration và seed ít nhất một lần trên **MySQL**. Kết quả SQLite, nếu dùng cho test nhanh, ghi riêng trong PR.
- Khi `php artisan serve` đang chạy, mở URL/route đã ghi trong `backend/README.md` hoặc kiểm tra từ terminal khác, ví dụ `curl -i http://127.0.0.1:8000/up` nếu dùng route mặc định. Ghi phiên bản PHP/MySQL, số test và kết quả thực tế.
- Chạy `git status --short`, `git diff --check` và `git diff -- frontend`. Sau khi stage, chạy `git diff --cached --check`, `git diff --cached --stat` và xem toàn bộ phần staged. Xác nhận PR không chứa thay đổi `frontend/`, file môi trường thật hoặc dữ liệu cá nhân. Nếu task phát sinh thay đổi frontend đã được nhóm thống nhất, chạy thêm `npm test` và `npm run build` trong `frontend/`.
- Nếu môi trường MySQL chưa chạy được, ghi nguyên nhân và các kiểm tra đã chạy. Có thể mở Draft PR để người khác kiểm tra cách cài đặt và chạy phần còn thiếu.

[Laravel Installation](https://laravel.com/docs/installation) · [Migration](https://laravel.com/docs/migrations) · [Seeding](https://laravel.com/docs/seeding) · [Database Testing](https://laravel.com/docs/database-testing)

## 4. PR tiếp theo — Nhập danh mục địa điểm

Sau khi PR khung được merge vào nhánh tích hợp, cập nhật nhánh đó rồi tạo `feat/place-data-import` cho phần nhập dữ liệu. Có thể khảo sát dữ liệu và chuẩn bị test đầu vào trong lúc chờ PR đầu.

- Đọc `frontend/public/data/catalog.json`, `frontend/public/data/sources.json` và `frontend/src/app/catalog.ts` để đối chiếu định dạng, mã địa điểm, các trường thiếu và thông tin nguồn. Đọc `frontend/public/data/osm-photo-sources.json` nếu cần chuyển thông tin ảnh đã có nguồn rõ ràng.
- Thống nhất các trường cần nhập với Bạn 2. Tạo một lệnh Artisan hoặc seeder có đầu vào rõ ràng, kiểm tra dữ liệu rồi cập nhật theo cặp nguồn và mã nguồn có ràng buộc duy nhất trong MySQL. Giữ mã công khai ổn định khi nhập lại. Với trường chưa biết, giữ `null` hoặc áp dụng cách biểu diễn đã chốt, không suy ra giá/giờ từ văn bản mẫu.
- Giữ liên kết, ghi công và giấy phép theo `sources.json`. Hồ sơ Góc Địa Phương lấy từ nguồn cộng đồng đang có cờ tham khảo và trạng thái quyền tái sử dụng chưa xác nhận. Dùng fixture tự tạo cho luồng test Local. Khi nhóm đưa dữ liệu tham khảo vào môi trường triển khai, giữ nguyên thông tin nguồn, trạng thái và phạm vi sử dụng đã thống nhất. Ảnh thiếu nguồn không được tự ghép vào hồ sơ.
- Có test cho bản ghi hợp lệ, thiếu trường bắt buộc, tọa độ sai, mã trùng và nhập lại không nhân đôi. Lệnh nhập báo số thêm, cập nhật và bỏ qua. Ghi rõ quy tắc xử lý dòng lỗi để người chạy biết dữ liệu nào đã được ghi.
- Chạy thử lệnh hai lần trên MySQL phát triển hoặc database test riêng. Ghi lệnh, tập dữ liệu, số bản ghi và các lý do bỏ qua vào PR. Tập lớn có thể nhập sau khi PR khung đã mở đường cho các bạn khác.

## 5. Prompt để Minh Hiếu gửi cho Codex

Sao chép đoạn dưới vào chat trong project TravelGo sau khi đã chọn nhánh làm việc.

```text
Tôi là Chung Minh Hiếu, phụ trách khung Laravel/MySQL và dữ liệu địa điểm của haiphamt/TravelGo. Tôi đang làm PR đầu tiên trên feat/backend-foundation.

Hãy đọc rules.md, docs/BACKEND_FOUNDATION_TASK.md và .github/pull_request_template.md. Nếu file hướng dẫn chưa có trong nhánh này, chạy git fetch origin rồi đọc bằng git show origin/docs/update-team-assignments:docs/BACKEND_FOUNDATION_TASK.md. Kiểm tra nhánh, git status, nội dung backend/ nếu có, và phiên bản PHP/Composer/MySQL đang chạy. Đọc frontend/public/data/sources.json, cấu trúc catalog.json và frontend/src/app/catalog.ts để biết phần dùng chung.

Triển khai phần PR đầu trong hướng dẫn. Dùng Laravel, PHPUnit và MySQL. Giữ module Angular và giao diện hiện có. Bàn giao khung chạy được, migration đã chốt, dữ liệu demo nhỏ, .env.example, hướng dẫn chạy và test tự động tương ứng. Phần đăng nhập email/Google do Tuấn Hải phụ trách. Phần nhập danh mục địa điểm làm ở PR tiếp theo. Nếu còn điểm schema dùng chung chưa chốt, tiếp tục các bước khởi tạo và ghi rõ điều cần thống nhất.

Khi xong, chạy lại migration, seed, kiểm thử thích hợp, kiểm tra khởi động và tự rà diff. Báo từng lệnh cùng kết quả thật và phần chưa xác minh. Kiểm tra kỹ database test, file môi trường, secret và thay đổi ngoài phạm vi. Soạn tiêu đề và nội dung PR theo mẫu repo, ghi phiên bản, cách chạy, dữ liệu thử và kết quả. Để tôi xem diff, xác nhận kết quả rồi quyết định commit, push và mở PR.
```

## 6. Quy trình đăng PR và bàn giao

1. Minh Hiếu đọc diff, chạy lại các bước chính hoặc kiểm tra log, rồi sửa những điểm còn thiếu. Tạo commit theo phạm vi, ví dụ `feat(backend): bootstrap Laravel and MySQL foundation`.
2. Chạy `git push -u origin feat/backend-foundation`. Mở PR trên [GitHub TravelGo](https://github.com/haiphamt/TravelGo/pulls). Chọn **base** là nhánh tích hợp đã chốt và **compare** là `feat/backend-foundation`.
3. Dùng [mẫu PR của repo](../.github/pull_request_template.md). Tiêu đề gợi ý `feat(backend): khởi tạo Laravel và MySQL cho TravelGo`. Ghi link task/backlog nếu có, cách cài đặt, lệnh test và kết quả đã chạy, giới hạn đã biết, phần AI hỗ trợ và cách mình xác minh.
4. Mời Tuấn Hải hoặc một thành viên khác review. Người review nên thử làm theo `backend/README.md` trên máy phát triển trước khi merge. Nếu có chỉnh sửa sau review, chạy lại test liên quan và cập nhật kết quả trong PR.
5. Sau merge, gửi link PR và cách chạy cho nhóm. Các nhánh nghiệp vụ lấy gốc từ nhánh tích hợp đã có backend. Minh Hiếu dùng cùng nền đó để làm PR nhập địa điểm.

[Cách tạo pull request trên GitHub](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request)

### Nội dung PR khung để điền sau khi kiểm thử

```markdown
## Task liên quan

- Khung backend và MySQL, Chung Minh Hiếu — <link task nếu đã có>

## Thay đổi / đầu ra

- <Phiên bản PHP/Laravel/MySQL và các điểm chính đã triển khai>
- <Migration hoặc dữ liệu mẫu dùng chung mà nhóm có thể dùng ngay>

## Kiểm tra và minh chứng

- Cài đặt và cấu hình MySQL theo `backend/README.md`.
- `php artisan migrate` và `php artisan migrate:status` — <kết quả>
- `php artisan db:seed` — <kết quả và số bản ghi khi chạy lại>
- `php artisan test` — <kết quả, số test và loại database đã dùng>
- <Route kiểm tra hoạt động, mã HTTP thực tế và URL local>
- <Phần chưa chạy, lý do và việc chuyển sang PR dữ liệu>

## Review

- Người kiểm tra — <tên thành viên được mời>
- AI hỗ trợ <phần việc>. Tôi đã kiểm tra lại bằng <diff, lệnh hoặc thao tác thực tế>.
- <Đánh dấu các mục đã hoàn thành trong mẫu PR của repo>
```
