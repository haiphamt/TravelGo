import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TravelStore } from "./store";
import { Icon } from "./icon";
import {
  localToday,
  MAX_PHOTOS,
  MAX_REVIEW_TEXT,
  validatePhoto,
  validateReview,
} from "./logic";

@Component({
  standalone: true,
  imports: [RouterLink, FormsModule, Icon],
  templateUrl: "./review.html",
})
export class ReviewPage {
  store = inject(TravelStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  destroy = inject(DestroyRef);
  id = signal("");
  place = computed(() => this.store.places().find((p) => p.id === this.id()));
  rating = signal(0);
  text = signal("");
  visitedOn = signal("");
  photos = signal<string[]>([]);
  error = signal("");
  processing = signal(false);
  saving = signal(false);
  preview = signal(false);
  cameraOpen = signal(false);
  cameraStream = signal<MediaStream | null>(null);
  cameraError = signal("");
  cameraPending = signal(false);
  cameraVideo = viewChild<ElementRef<HTMLVideoElement>>("cameraVideo");
  cameraDialog = viewChild<ElementRef<HTMLDialogElement>>("cameraDialog");
  today = localToday();
  maxText = MAX_REVIEW_TEXT;
  stars = [1, 2, 3, 4, 5];
  ratingLabels = [
    "Chọn số sao",
    "Chưa hài lòng",
    "Cần cải thiện",
    "Ổn",
    "Hài lòng",
    "Rất hài lòng",
  ];
  tags = [
    "Món ăn hợp vị",
    "Không gian dễ chịu",
    "Giá hợp lý",
    "Phục vụ thân thiện",
  ];
  editing = computed(() => !!this.store.reviewFor(this.id()));
  private loadedId = "";
  private disposed = false;
  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.id.set(params.get("id") ?? ""));
    effect(() => {
      const id = this.id();
      if (this.store.ready() && id && this.loadedId !== id) {
        const existing = this.store.reviewFor(id);
        this.loadedId = id;
        this.rating.set(existing?.rating ?? 0);
        this.text.set(existing?.text ?? "");
        this.visitedOn.set(existing?.visitedOn ?? "");
        this.photos.set(existing?.photos ?? []);
      }
    });
    effect(() => {
      const video = this.cameraVideo()?.nativeElement;
      const stream = this.cameraStream();
      if (video && stream) {
        video.srcObject = stream;
        void video
          .play()
          .catch(() =>
            this.cameraError.set(
              "Chưa phát được camera. Hãy đóng rồi thử lại, hoặc chọn ảnh có sẵn.",
            ),
          );
      }
    });
    effect(() => {
      const dialog = this.cameraDialog()?.nativeElement;
      if (dialog && this.cameraOpen() && !dialog.open) dialog.showModal();
    });
    this.destroy.onDestroy(() => {
      this.disposed = true;
      this.stopCamera();
    });
  }
  addTag(tag: string) {
    if (this.text().includes(tag)) return;
    const next = [this.text().trim(), tag].filter(Boolean).join(". ");
    if (next.length <= this.maxText) this.text.set(next);
  }
  async selectPhotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length || this.processing()) return;
    if (this.photos().length + files.length > MAX_PHOTOS) {
      this.error.set("Chọn tối đa 3 ảnh cho một đánh giá.");
      return;
    }
    for (const file of files) {
      const error = validatePhoto(file, this.photos().length);
      if (error) {
        this.error.set(error);
        return;
      }
    }
    this.processing.set(true);
    this.error.set("");
    try {
      const processed = await Promise.all(
        files.map((file) => this.preparePhoto(file)),
      );
      if (!this.disposed)
        this.photos.update((current) => [...current, ...processed]);
    } catch {
      this.error.set(
        "Có ảnh không đọc được. Hãy chọn lại ảnh JPG, PNG hoặc WebP hợp lệ.",
      );
    } finally {
      this.processing.set(false);
    }
  }
  private preparePhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        try {
          if (
            !image.naturalWidth ||
            !image.naturalHeight ||
            image.naturalWidth * image.naturalHeight > 60_000_000
          )
            throw new Error("Image dimensions unsupported");
          const scale = Math.min(
            1,
            1280 / Math.max(image.naturalWidth, image.naturalHeight),
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.naturalWidth * scale);
          canvas.height = Math.round(image.naturalHeight * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Invalid image"));
      };
      image.src = url;
    });
  }
  async startCamera() {
    if (this.photos().length >= MAX_PHOTOS) {
      this.error.set("Bạn đã có 3 ảnh. Hãy bỏ một ảnh trước khi chụp thêm.");
      return;
    }
    this.cameraOpen.set(true);
    this.cameraError.set("");
    this.cameraPending.set(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      if (this.disposed || !this.cameraOpen())
        stream.getTracks().forEach((track) => track.stop());
      else this.cameraStream.set(stream);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      this.cameraError.set(
        name === "NotAllowedError"
          ? "Chưa được phép dùng camera. Bạn có thể cho phép camera trong trình duyệt hoặc chọn ảnh có sẵn."
          : "Không mở được camera trên thiết bị này. Bạn vẫn có thể chọn ảnh có sẵn.",
      );
    } finally {
      this.cameraPending.set(false);
    }
  }
  stopCamera() {
    this.cameraStream()
      ?.getTracks()
      .forEach((track) => track.stop());
    this.cameraStream.set(null);
    this.cameraDialog()?.nativeElement.close();
    this.cameraOpen.set(false);
  }
  capture() {
    const video = this.cameraVideo()?.nativeElement;
    if (!video?.videoWidth) {
      this.cameraError.set(
        "Camera chưa sẵn sàng. Vui lòng đợi hình ảnh xuất hiện.",
      );
      return;
    }
    const scale = Math.min(
      1,
      1280 / Math.max(video.videoWidth, video.videoHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.cameraError.set(
        "Thiết bị chưa hỗ trợ chụp ảnh. Hãy chọn ảnh có sẵn.",
      );
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (this.photos().length < MAX_PHOTOS)
      this.photos.update((items) => [
        ...items,
        canvas.toDataURL("image/jpeg", 0.82),
      ]);
    this.stopCamera();
    this.error.set("");
  }
  removePhoto(index: number) {
    this.photos.update((items) => items.filter((_, i) => i !== index));
  }
  reviewValue() {
    return {
      placeId: this.id(),
      rating: this.rating(),
      text: this.text().trim(),
      photos: this.photos(),
      visitedOn: this.visitedOn(),
      updatedAt: new Date().toISOString(),
    };
  }
  showPreview() {
    const error = validateReview(this.reviewValue());
    this.error.set(error);
    if (!error) this.preview.set(true);
  }
  async submit() {
    if (this.saving() || this.processing() || !this.store.ready()) return;
    const review = this.reviewValue();
    const error = validateReview(review);
    this.error.set(error);
    if (error) {
      this.preview.set(false);
      return;
    }
    this.saving.set(true);
    if (await this.store.saveReview(review)) {
      this.store.toast(
        "Đã lưu đánh giá trong bản dùng thử trên trình duyệt này.",
      );
      await this.router.navigate(["/dia-diem", this.id()], {queryParamsHandling: "preserve"});
    } else
      this.error.set(
        "Chưa lưu được đánh giá. Nội dung và ảnh vẫn còn ở đây; hãy thử lại.",
      );
    this.saving.set(false);
  }
}
