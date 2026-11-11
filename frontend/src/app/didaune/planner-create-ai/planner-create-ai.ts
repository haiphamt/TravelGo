// Adapted from Didaune planner-create-ai at 04597f66b7263c8cc8e7bcf51115ad8622d1dfad.
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { validTripBudget, validTripCover, validTripDate, validateTripDraft } from '../../logic';
import { TravelStore } from '../../store';
import { PlannerTripForm } from '../planner/shared/planner-trip-form';
import { buildPlannerPreview, plannerArea } from './planner-preview';

const DRAFT_KEY = 'travelgo-planner-ai-draft-v1';
const emptyDraft = {
  tripTitle: '', tripDescription: '', coverPreviewUrl: '', startDate: '', endDate: '',
  peopleCount: 2 as number | null, estimatedBudget: null as number | null,
  destinationCity: 'TP.HCM', desiredPlaces: '', travelMode: 'car', tripStyle: 'balanced',
  energyLevel: 'balanced', companionType: 'couple', preferencesInput: 'cafe, ăn uống, chill', extraNotes: '',
  count: 3, includeLocal: false,
};

type PlannerDraft = typeof emptyDraft;
type PlannerPreview = ReturnType<typeof buildPlannerPreview> & { form: PlannerDraft; note: string; budget: number | null };
const travelModes = { car: 'Ô tô', motorbike: 'Xe máy', walking: 'Đi bộ', mixed: 'Linh hoạt' };
const tripStyles = { balanced: 'Cân bằng', relaxed: 'Nhẹ nhàng', packed: 'Đi nhiều' };
const energyLevels = { balanced: 'Linh hoạt', low: 'Thư thái', high: 'Năng động' };
const companionTypes = { couple: 'Cặp đôi', friends: 'Bạn bè', family: 'Gia đình', solo: 'Một mình' };

function restoreDraft(): PlannerDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft;
    const restored = JSON.parse(raw) as PlannerDraft;
    const textFields = Object.keys(emptyDraft).filter(key => typeof emptyDraft[key as keyof PlannerDraft] === 'string');
    if (textFields.some(key => typeof restored[key as keyof PlannerDraft] !== 'string')) return emptyDraft;
    return {
      ...emptyDraft, ...restored,
      coverPreviewUrl: validTripCover(restored.coverPreviewUrl) ? restored.coverPreviewUrl : '',
    };
  } catch {
    return emptyDraft;
  }
}

@Component({
  selector: 'app-planner-create-ai',
  standalone: true,
  imports: [FormsModule, RouterLink, PlannerTripForm],
  host: { class: 'didaune-ui' },
  templateUrl: './planner-create-ai.html',
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
    .ai-input {
      width: 100%;
      min-width: 0;
      min-height: 44px;
      border-radius: 0.75rem;
      border: 1.5px solid #cbd5e1;
      background: #f8fafc;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #334155;
      transition: border-color 0.2s ease, background-color 0.2s ease;
    }
    .ai-input:focus { border-color: #f97316; background: #fff; }
    .ai-input::placeholder { color: #64748b; font-weight: 500; }
    .ai-local { display: flex; min-height: 44px; align-items: center; gap: 8px; }
    .ai-local input { width: 18px; height: 18px; flex: none; accent-color: #c2410c; }
    .ai-cta { border: 0; color: #fff; min-height: 44px; }
    .ai-stop-list { list-style: decimal; padding-inline-start: 1.5rem; }
    .ai-stop-list li + li { margin-top: 0.75rem; }
    @media (min-width: 1050px) {
      .planner-grid { grid-template-columns: minmax(0, 1fr) minmax(21rem, min(45%, 30rem)); }
    }
  `],
})
export class PlannerCreateAi {
  readonly store = inject(TravelStore);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly previewHeading = viewChild<ElementRef<HTMLHeadingElement>>('previewHeading');

  readonly form = signal(restoreDraft());
  readonly generating = signal(false);
  readonly saving = signal(false);
  readonly committed = signal(false);
  readonly coverReading = signal(false);
  readonly showTitleWarning = signal(false);
  readonly showDateWarning = signal(false);
  readonly error = signal('');
  readonly draftStorageFailed = signal(false);
  readonly travelModes = Object.entries(travelModes);
  readonly tripStyles = Object.entries(tripStyles);
  readonly energyLevels = Object.entries(energyLevels);
  readonly companionTypes = Object.entries(companionTypes);

  private readonly candidate = signal<PlannerPreview | null>(null);
  readonly preview = computed(() => {
    const result = this.candidate();
    return result?.form === this.form() ? result : null;
  });
  readonly catalogChanged = computed(() => {
    const result = this.preview();
    if (!result) return false;
    const live = this.store.places();
    return result.points.some(point => !live.some(place => place.id === point.placeId && !place.demoChange?.status));
  });
  private readonly formatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  private readonly numberFormatter = new Intl.NumberFormat('vi-VN');

  constructor() {
    effect(() => {
      if (this.committed()) return;
      const draft = this.form();
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        this.draftStorageFailed.set(false);
      } catch {
        this.draftStorageFailed.set(true);
      }
    });
  }

  set<K extends keyof PlannerDraft>(key: K, value: PlannerDraft[K]) {
    if (this.saving() || this.committed()) return;
    this.form.update(draft => ({ ...draft, [key]: value }));
    this.error.set('');
    this.showTitleWarning.set(false);
    this.showDateWarning.set(false);
  }

  dateLabel(date: string) {
    return this.formatter.format(Date.parse(date));
  }

  amountLabel(amount: number) {
    return this.numberFormatter.format(amount);
  }

  async generateTrip() {
    if (this.generating() || this.saving() || this.committed() || this.coverReading()) return;
    this.candidate.set(null);
    const form = this.form();
    const error = this.validateTripForm(form);
    this.error.set(error);
    if (error || this.store.catalogStatus() !== 'ready') return;

    this.generating.set(true);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (this.destroy.destroyed) return;
    try {
      const input = { needs: form.preferencesInput, area: plannerArea(form.destinationCity), count: form.count, includeLocal: form.includeLocal };
      const result = buildPlannerPreview(this.store.places(), input, form.desiredPlaces, form.startDate, form.endDate);
      if (!result.points.length) {
        this.error.set('Chưa tìm được điểm phù hợp trong danh mục TP.HCM. Thử tên khu vực khác hoặc từ khóa như cà phê, công viên.');
        return;
      }
      const budget = form.estimatedBudget === null ? null : Math.floor(form.estimatedBudget / (form.peopleCount ?? 1));
      const note = this.buildTripNote(form);
      this.candidate.set({ ...result, form, note, budget });
      afterNextRender(() => this.previewHeading()?.nativeElement.focus(), { injector: this.injector });
    } catch {
      this.error.set('Chưa tạo được gợi ý. Hãy thử lại với thông tin đã nhập.');
    } finally {
      this.generating.set(false);
    }
  }

  async savePreview() {
    const result = this.preview();
    if (!result || this.saving() || this.committed() || this.coverReading() || this.catalogChanged()) return;
    const { form, note, budget, points } = result;
    const trip = {
      name: form.tripTitle.trim(), date: form.startDate, endDate: form.endDate, note, budget, points,
      cover: form.coverPreviewUrl || undefined, source: 'ai-demo' as const,
    };
    const error = validateTripDraft(trip);
    this.error.set(error);
    if (error) return;

    this.saving.set(true);
    try {
      if (!(await this.store.createTrip(trip))) {
        this.error.set('Chưa lưu được lịch trình. Kiểm tra danh mục và thử lại.');
        return;
      }
      this.committed.set(true);
      try { sessionStorage.removeItem(DRAFT_KEY); }
      catch { /* IndexedDB already has the saved itinerary. */ }
      if (!this.destroy.destroyed) await this.router.navigate(['/lich-trinh/chinh-sua']);
    } finally {
      this.saving.set(false);
    }
  }

  private validateTripForm(form: PlannerDraft): string {
    this.showTitleWarning.set(!form.tripTitle.trim() || form.tripTitle.trim().length > 80);
    this.showDateWarning.set(!validTripDate(form.startDate) || !validTripDate(form.endDate) || form.endDate < form.startDate);
    if (this.showTitleWarning()) return 'Nhập tên chuyến đi tối đa 80 ký tự.';
    if (this.showDateWarning()) return 'Chọn ngày bắt đầu và ngày kết thúc. Ngày kết thúc phải trùng hoặc sau ngày bắt đầu.';
    if (!form.destinationCity.trim()) return 'Nhập TP.HCM hoặc khu vực bạn muốn tới.';
    if (form.peopleCount === null || !Number.isSafeInteger(form.peopleCount) || form.peopleCount < 1) return 'Nhập số người bằng số nguyên từ 1 trở lên.';
    if (form.estimatedBudget !== null && !validTripBudget(form.estimatedBudget)) return 'Nhập tổng ngân sách bằng số nguyên không âm.';
    if (!form.desiredPlaces.trim() && !form.preferencesInput.trim()) return 'Nhập điểm muốn ghé hoặc sở thích để tìm trong danh mục.';
    if (!Number.isInteger(form.count) || form.count < 1 || form.count > 5) return 'Chọn từ 1 đến 5 điểm ghé.';
    if (this.buildTripNote(form).length > 500) return 'Rút ngắn mô tả chuyến đi hoặc yêu cầu thêm để ghi chú lưu trong 500 ký tự.';
    return '';
  }

  private buildTripNote(form: PlannerDraft) {
    const summary = [
      `${form.peopleCount} người`, companionTypes[form.companionType as keyof typeof companionTypes],
      travelModes[form.travelMode as keyof typeof travelModes], tripStyles[form.tripStyle as keyof typeof tripStyles],
      energyLevels[form.energyLevel as keyof typeof energyLevels],
    ].filter(Boolean).join(' · ');
    return [form.tripDescription.trim(), summary, form.extraNotes.trim()].filter(Boolean).join('\n');
  }
}
