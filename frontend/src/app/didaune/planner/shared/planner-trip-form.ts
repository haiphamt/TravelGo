// Adapted from Didaune planner/shared/planner-trip-form at 04597f66b7263c8cc8e7bcf51115ad8622d1dfad.
import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { validTripDate } from '../../../logic';

@Component({
  selector: 'app-planner-trip-form',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'didaune-ui' },
  templateUrl: './planner-trip-form.html',
  styles: [`
    :host { display: block; }
    .custom-shadow { box-shadow: 0 10px 40px -10px rgb(0 0 0 / 5%); }
    .ai-label {
      display: block;
      margin-bottom: 5px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #64748b;
    }
    .planner-cover:focus-within { outline: 3px solid #c2410c; outline-offset: 4px; }
    .planner-title:focus-visible, .planner-description:focus-visible { outline: 3px solid #c2410c; }
    .planner-date-trigger { border: 0; }
    .planner-date-input { color: #334155; min-height: 44px; }
  `],
})
export class PlannerTripForm {
  readonly heading = input('Thông tin chuyến đi');
  readonly descriptionHint = input('Nhập thông tin cơ bản trước, sau đó bạn có thể bổ sung thêm quán và lịch trình chi tiết.');
  readonly title = input('');
  readonly description = input('');
  readonly coverPreviewUrl = input('');
  readonly startDate = input('');
  readonly endDate = input('');
  readonly showTitleWarning = input(false);
  readonly showDateWarning = input(false);

  readonly titleChange = output<string>();
  readonly descriptionChange = output<string>();
  readonly coverChange = output<string>();
  readonly startDateChange = output<string>();
  readonly endDateChange = output<string>();
  readonly coverReadingChange = output<boolean>();

  readonly dateOpen = signal(false);
  readonly coverError = signal('');
  readonly coverReading = signal(false);
  private readonly destroy = inject(DestroyRef);
  private readonly dateFormatter = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  });

  readonly tripDays = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    return validTripDate(start) && validTripDate(end) && end >= start
      ? (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1
      : 0;
  });

  readonly dateRangeLabel = computed(() => {
    const [start, end] = [this.startDate(), this.endDate()].filter(validTripDate);
    if (!start) return 'Chọn khoảng ngày cho chuyến đi';
    const first = this.dateFormatter.format(Date.parse(start));
    return end && start !== end ? `${first} – ${this.dateFormatter.format(Date.parse(end))}` : first;
  });

  constructor() {
    effect(() => {
      if (this.showDateWarning()) this.dateOpen.set(true);
    });
  }

  async onCoverSelected(event: Event) {
    const control = event.target as HTMLInputElement;
    const file = control.files?.[0];
    control.value = '';
    if (!file || this.coverReading()) return;
    this.coverError.set('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 1024 * 1024) {
      this.coverError.set('Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 1 MB.');
      return;
    }

    this.coverReading.set(true);
    this.coverReadingChange.emit(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(reader.error);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('Ảnh không hợp lệ');
      if (!this.destroy.destroyed) this.coverChange.emit(data);
    } catch {
      if (!this.destroy.destroyed) this.coverError.set('Chưa đọc được ảnh bìa. Hãy chọn ảnh khác.');
    } finally {
      if (!this.destroy.destroyed) {
        this.coverReading.set(false);
        this.coverReadingChange.emit(false);
      }
    }
  }

  removeCover() {
    this.coverError.set('');
    this.coverChange.emit('');
  }
}
