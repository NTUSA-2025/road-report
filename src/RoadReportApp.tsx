import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  LocateFixed,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { useEffect, useRef, useState } from "react";

type RepairItem = {
  value: string;
  label: string;
};

type Coordinates = {
  lat: number;
  lng: number;
  source: "default" | "device" | "photo" | "map";
};

type PhotoMeta = {
  takenAt: Date | null;
  coordinates: Coordinates | null;
};

type CaptchaState = {
  ready: boolean;
  loading: boolean;
  imageUrl: string;
  error: string;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

const DEFAULT_COORDS: Coordinates = {
  lat: 25.01734,
  lng: 121.53975,
  source: "default",
};

const FALLBACK_ITEMS: RepairItem[] = [
  { value: "1", label: "路燈 street light" },
  { value: "2", label: "水溝蓋 gutter cover" },
  { value: "3", label: "水管（室外） water pipe(outdoor)" },
  { value: "4", label: "廁所設備 public toilet equipment" },
  { value: "5", label: "路面 road pavement" },
  { value: "6", label: "戶外電線 outdoor electrical wire" },
  { value: "7", label: "其他 other" },
];

const STEPS = [
  { title: "拍照", hint: "先留下現場畫面" },
  { title: "現況", hint: "選類型並描述問題" },
  { title: "位置", hint: "確認地點與座標" },
  { title: "聯絡", hint: "填寫必要聯絡方式" },
  { title: "驗證", hint: "送出前輸入驗證碼" },
] as const;

export function RoadReportApp() {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState<Coordinates>(DEFAULT_COORDS);
  const [items, setItems] = useState<RepairItem[]>(FALLBACK_ITEMS);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoMeta, setPhotoMeta] = useState<PhotoMeta>({
    takenAt: null,
    coordinates: null,
  });
  const [description, setDescription] = useState("");
  const [itemId, setItemId] = useState("5");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [moreInfo, setMoreInfo] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaState>({
    ready: false,
    loading: true,
    imageUrl: "",
    error: "",
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [geoMessage, setGeoMessage] = useState("地圖預設在臺大校園，可用定位或點選地圖修正。");

  useEffect(() => {
    function setAppHeight() {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    }

    setAppHeight();
    window.addEventListener("resize", setAppHeight);
    window.visualViewport?.addEventListener("resize", setAppHeight);

    return () => {
      window.removeEventListener("resize", setAppHeight);
      window.visualViewport?.removeEventListener("resize", setAppHeight);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function createRepairSession() {
      try {
        const response = await fetch("/api/repair/session", {
          method: "POST",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "無法取得 NTU 表單");
        }

        if (!ignore) {
          setCaptcha({
            ready: true,
            loading: false,
            imageUrl: `${payload.captchaUrl}&v=${Date.now()}`,
            error: "",
          });
          if (Array.isArray(payload.items) && payload.items.length > 0) {
            setItems(payload.items);
          }
        }
      } catch (error) {
        if (!ignore) {
          setCaptcha({
            ready: false,
            loading: false,
            imageUrl: "",
            error:
              error instanceof Error
                ? error.message
                : "暫時無法連線到 NTU 報修表單。",
          });
        }
      }
    }

    createRepairSession();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  const takenDate = photoMeta.takenAt ?? new Date();
  const completionCount = [
    photo,
    description.trim(),
    phone.trim(),
    hasValidCoordinates(coords),
    captchaAnswer.trim().length === 5,
  ].filter(Boolean).length;
  const selectedItemLabel =
    items.find((item) => item.value === itemId)?.label ?? "路面";
  const coordinateLabel = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
  const activeStep = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentStep]);

  function updateCoords(next: Coordinates) {
    setCoords(next);
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      setGeoMessage("這台裝置不支援定位，請直接點選地圖或手動輸入地點。");
      return;
    }

    setGeoMessage("正在取得目前位置...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "device",
        };
        updateCoords(next);
        setGeoMessage("已用手機定位更新座標，仍可點地圖微調。");
      },
      () => {
        setGeoMessage("無法取得定位權限，請允許定位或用地圖手動標記。");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function handlePhotoSelected(file: File | null) {
    if (!file) {
      return;
    }

    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }

    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));

    const meta = await readPhotoMeta(file);
    setPhotoMeta(meta);

    const nextTakenAt = meta.takenAt ?? new Date(file.lastModified);
    setMoreInfo((current) => {
      const stamp = formatDateForText(nextTakenAt);
      return current || `照片拍攝/選取時間：${stamp}`;
    });

    if (meta.coordinates) {
      updateCoords({ ...meta.coordinates, source: "photo" });
      setGeoMessage("已從照片 EXIF 讀到座標並更新地圖。");
    } else {
      setGeoMessage("照片沒有可讀取的 GPS 資訊；可用手機定位或點選地圖。");
    }
  }

  async function refreshCaptcha() {
    setCaptcha((current) => ({ ...current, loading: true, error: "" }));
    setCaptchaAnswer("");

    try {
      const response = await fetch("/api/repair/captcha/refresh", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "無法更換驗證碼");
      }

      setCaptcha({
        ready: true,
        loading: false,
        imageUrl: `${payload.captchaUrl}&v=${Date.now()}`,
        error: "",
      });
    } catch (error) {
      setCaptcha({
        ready: false,
        loading: false,
        imageUrl: "",
        error:
          error instanceof Error
            ? error.message
            : "暫時無法更換驗證碼。",
      });
    }
  }

  function handleMapChange(next: Coordinates) {
    updateCoords({ ...next, source: "map" });
    setGeoMessage("已依照地圖位置更新座標。");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const missing = firstMissingStep();
    if (missing != null) {
      setSubmitState("error");
      setSubmitMessage(validateRequiredFields(missing) ?? `請先完成「${STEPS[missing].title}」再送出。`);
      setCurrentStep(missing);
      return;
    }

    if (!photo) {
      setSubmitState("error");
      setSubmitMessage("請先拍照或選擇照片。");
      setCurrentStep(0);
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage("");

    const formData = new FormData();
    formData.set("ApplicantName", name);
    formData.set("ApplicantPhone", phone);
    formData.set("ApplicantEmail", email);
    formData.set("Location", formatCoordinateValue(coords));
    formData.set("BrokenItemId", itemId);
    formData.set("Reason", description);
    formData.set("ImageDescription", moreInfo);
    formData.set("CapAns", captchaAnswer.trim());
    formData.set("ImageTakenYear", `${takenDate.getFullYear()}`);
    formData.set("ImageTakenMonth", `${takenDate.getMonth() + 1}`);
    formData.set("ImageTakenDay", `${takenDate.getDate()}`);
    formData.set("Latitude", coords.lat.toFixed(6));
    formData.set("Longitude", coords.lng.toFixed(6));
    formData.set("ImageFiles", photo, photo.name);

    try {
      const response = await fetch("/api/repair/submit", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "送出失敗");
      }

      setSubmitState("success");
      setSubmitMessage(payload.message ?? "已送出到 NTU 報修表單。");
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : "送出時發生問題，請稍後再試。",
      );
      refreshCaptcha();
    }
  }

  function goToStep(step: number) {
    setSubmitMessage("");
    setCurrentStep(Math.max(0, Math.min(step, STEPS.length - 1)));
  }

  function goNext() {
    const error = validateRequiredFields(currentStep);

    if (error) {
      setSubmitState("error");
      setSubmitMessage(error);
      return;
    }

    goToStep(currentStep + 1);
  }

  function goBack() {
    goToStep(currentStep - 1);
  }

  function firstMissingStep() {
    for (let step = 0; step < STEPS.length; step += 1) {
      if (validateRequiredFields(step)) {
        return step;
      }
    }

    return null;
  }

  function validateRequiredFields(step: number) {
    if (step === 0 && !photo) {
      return "請先拍照或上傳照片。";
    }

    if (step === 1) {
      if (!itemId.trim()) {
        return "請先選擇申報項目。";
      }

      if (!description.trim()) {
        return "請先填寫道路狀況描述。";
      }
    }

    if (step === 2 && !hasValidCoordinates(coords)) {
      return "請先確認有效的經緯度位置。";
    }

    if (step === 3 && !phone.trim()) {
      return "請先填寫聯絡電話。";
    }

    if (step === 4 && captchaAnswer.trim().length !== 5) {
      return "請輸入 5 碼驗證碼。";
    }

    return "";
  }

  return (
    <main className="mobile-app-shell">
      <form className="report-app" noValidate onSubmit={handleSubmit}>
        <header className="app-header">
          <div>
            <h1>道路狀況回報</h1>
            <p>{activeStep.hint}</p>
          </div>
          <div className="progress-pill" aria-label={`已完成 ${completionCount} 個必要步驟`}>
            {completionCount}/5
          </div>
        </header>

        <nav className="step-tabs" aria-label="回報步驟">
          {STEPS.map((step, index) => (
            <button
              aria-current={currentStep === index ? "step" : undefined}
              className="step-tab"
              key={step.title}
              onClick={() => goToStep(index)}
              type="button"
            >
              {currentStep > index ? (
                <Check aria-hidden="true" size={15} strokeWidth={3} />
              ) : (
                <span>{index + 1}</span>
              )}
              {step.title}
            </button>
          ))}
        </nav>

        <section className="step-viewport" aria-live="polite">
          <div className="step-screen" key={activeStep.title}>
            <div className="step-heading">
              <span>步驟 {currentStep + 1}</span>
              <h2>{activeStep.title}</h2>
            </div>

            {currentStep === 0 ? (
              <section className="capture-stage" aria-label="拍照上傳">
                <input
                  ref={cameraInputRef}
                  accept="image/jpeg,image/png,image/bmp"
                  capture="environment"
                  className="file-input"
                  name="camera-photo"
                  onChange={(event) =>
                    handlePhotoSelected(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
                <input
                  ref={uploadInputRef}
                  accept="image/jpeg,image/png,image/bmp"
                  className="file-input"
                  name="uploaded-photo"
                  onChange={(event) =>
                    handlePhotoSelected(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />

                <div className="photo-preview" aria-live="polite">
                  {photoUrl ? (
                    <img alt="準備送出的道路狀況照片" src={photoUrl} />
                  ) : (
                    <div className="empty-photo">
                      <strong>先拍一張現場照片</strong>
                      <span>會自動讀取拍攝日期，若照片包含 GPS 也會更新地圖位置。</span>
                    </div>
                  )}
                </div>

                <div className="stage-topbar">
                  <span>{photo ? "照片已就緒" : "需要照片"}</span>
                  <span>{formatDateForText(takenDate)}</span>
                </div>

                <button
                  className="camera-button"
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera aria-hidden="true" size={22} strokeWidth={2.6} />
                  {photo ? "重新拍照" : "拍照"}
                </button>

                <button
                  className="upload-photo-button"
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" size={18} strokeWidth={2.5} />
                  上傳照片
                </button>

                <div className="photo-meta">
                  <div>
                    <span>拍攝日期</span>
                    <strong>{formatDateForText(takenDate)}</strong>
                  </div>
                  <div>
                    <span>位置資訊</span>
                    <strong>{photoMeta.coordinates ? "照片已帶入" : "下一步確認"}</strong>
                  </div>
                </div>
              </section>
            ) : null}

            {currentStep === 1 ? (
              <section className="app-card details-card" aria-label="報修現況">
                <div className="card-title">
                  <span>2</span>
                  <div>
                    <h2>現況</h2>
                    <p>{selectedItemLabel}</p>
                  </div>
                </div>

                <label className="field-label">
                  申報項目
                  <select
                    onChange={(event) => setItemId(event.target.value)}
                    required
                    value={itemId}
                  >
                    {items.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label">
                  發生什麼狀況
                  <textarea
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="例：路面破損，腳踏車經過時容易摔倒。"
                    required
                    rows={4}
                    value={description}
                  />
                </label>

                <label className="field-label">
                  相片補充
                  <input
                    onChange={(event) => setMoreInfo(event.target.value)}
                    placeholder="可補充照片角度、附近地標"
                    type="text"
                    value={moreInfo}
                  />
                </label>
              </section>
            ) : null}

            {currentStep === 2 ? (
              <section className="app-card location-card" aria-label="位置">
                <div className="card-title">
                  <span>3</span>
                  <div>
                    <h2>位置</h2>
                    <p>{geoMessage}</p>
                  </div>
                </div>

                <div className="location-actions">
                  <button className="soft-button" type="button" onClick={handleLocate}>
                    <LocateFixed aria-hidden="true" size={18} strokeWidth={2.4} />
                    用手機定位
                  </button>
                  <div className="coord-chip">{coordinateLabel}</div>
                </div>

                <LowInterferenceMap coords={coords} onChange={handleMapChange} />

                <div className="coordinate-panel">
                  <span>送出座標</span>
                  <strong>{formatCoordinateValue(coords)}</strong>
                </div>
              </section>
            ) : null}

            {currentStep === 3 ? (
              <section className="app-card contact-card" aria-label="聯絡資料">
                <div className="card-title">
                  <span>4</span>
                  <div>
                    <h2>聯絡資料</h2>
                    <p>電話為必填，姓名與信箱不公開。</p>
                  </div>
                </div>

                <label className="field-label">
                  聯絡電話
                  <input
                    autoComplete="tel"
                    maxLength={15}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="09xx-xxx-xxx"
                    required
                    type="tel"
                    value={phone}
                  />
                </label>

                <div className="two-fields">
                  <label className="field-label">
                    姓名
                    <input
                      autoComplete="name"
                      onChange={(event) => setName(event.target.value)}
                      type="text"
                      value={name}
                    />
                  </label>
                  <label className="field-label">
                    E-mail
                    <input
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      value={email}
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {currentStep === 4 ? (
              <section className="app-card captcha-card" aria-label="驗證碼">
                <div className="card-title">
                  <span>5</span>
                  <div>
                    <h2>驗證碼</h2>
                    <p>輸入 NTU 表單上的 5 碼驗證碼。</p>
                  </div>
                </div>

                <div className="captcha-box">
                  <div className="captcha-image">
                    {captcha.loading ? (
                      <span>載入中</span>
                    ) : captcha.imageUrl ? (
                      <img alt="NTU 報修驗證碼" src={captcha.imageUrl} />
                    ) : (
                      <span>無法載入</span>
                    )}
                  </div>
                  <button className="soft-button" type="button" onClick={refreshCaptcha}>
                    <RefreshCw aria-hidden="true" size={18} strokeWidth={2.4} />
                    換一張
                  </button>
                  <input
                    inputMode="text"
                    maxLength={5}
                    minLength={5}
                    onChange={(event) => setCaptchaAnswer(event.target.value)}
                    placeholder="輸入 5 碼"
                    required
                    value={captchaAnswer}
                  />
                </div>

                {captcha.error ? <p className="error-text">{captcha.error}</p> : null}
              </section>
            ) : null}
          </div>
        </section>

        <div className="bottom-dock">
          {submitMessage ? (
            <p
              className={`dock-message ${
                submitState === "success" ? "success-text" : "error-text"
              }`}
            >
              {submitMessage}
            </p>
          ) : null}
          <div className="dock-actions">
            <button
              className="back-button"
              disabled={currentStep === 0 || submitState === "submitting"}
              onClick={goBack}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.5} />
              上一步
            </button>
            {isLastStep ? (
              <button
                className="submit-button"
                disabled={submitState === "submitting" || captcha.loading}
                type="submit"
              >
                <Send aria-hidden="true" size={18} strokeWidth={2.5} />
                {submitState === "submitting" ? "送出中..." : "送出報修"}
              </button>
            ) : (
              <button
                className="submit-button"
                onClick={goNext}
                type="button"
              >
                <ArrowRight aria-hidden="true" size={18} strokeWidth={2.5} />
                下一步
              </button>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}

function LowInterferenceMap({
  coords,
  onChange,
}: {
  coords: Coordinates;
  onChange: (coordinates: Coordinates) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const initialCoordsRef = useRef(coords);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let disposed = false;

    async function setupMap() {
      const L = await import("leaflet");

      if (disposed || !containerRef.current || mapRef.current) {
        return;
      }

      const initialCoords = initialCoordsRef.current;
      const map = L.map(containerRef.current, {
        attributionControl: false,
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView([initialCoords.lat, initialCoords.lng], 18);

      L.tileLayer(
        "/api/map/tiles/light_all/{z}/{x}/{y}.png",
        {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        },
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control
        .attribution({ position: "bottomleft", prefix: false })
        .addTo(map);

      const marker = L.marker([initialCoords.lat, initialCoords.lng], {
        icon: L.divIcon({
          className: "leaflet-report-marker",
          iconAnchor: [14, 30],
          iconSize: [28, 30],
        }),
        keyboard: false,
      }).addTo(map);

      map.on("click", (event) => {
        onChangeRef.current({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
          source: "map",
        });
      });

      mapRef.current = map;
      markerRef.current = marker;
      window.requestAnimationFrame(() => map.invalidateSize());
    }

    setupMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const next: [number, number] = [coords.lat, coords.lng];
    markerRef.current?.setLatLng(next);
    mapRef.current?.panTo(next, { animate: true, duration: 0.25 });
  }, [coords.lat, coords.lng]);

  return (
    <div
      aria-label="拖曳或點選地圖更新位置"
      className="map-canvas"
      ref={containerRef}
      role="application"
    />
  );
}

function formatCoordinateValue(coordinates: Coordinates) {
  return `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`;
}

function hasValidCoordinates(coordinates: Coordinates) {
  return (
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
  );
}

function formatDateForText(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  if (!/jpe?g$/i.test(file.name) && file.type !== "image/jpeg") {
    return { takenAt: new Date(file.lastModified), coordinates: null };
  }

  try {
    const buffer = await file.arrayBuffer();
    return parseJpegExif(buffer, new Date(file.lastModified));
  } catch {
    return { takenAt: new Date(file.lastModified), coordinates: null };
  }
}

function parseJpegExif(buffer: ArrayBuffer, fallbackDate: Date): PhotoMeta {
  const view = new DataView(buffer);
  let offset = 2;

  if (view.getUint16(0) !== 0xffd8) {
    return { takenAt: fallbackDate, coordinates: null };
  }

  while (offset < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }

    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);

    if (marker === 0xe1) {
      const header = readAscii(view, offset + 4, 6);
      if (header === "Exif\0\0") {
        return parseTiff(view, offset + 10, fallbackDate);
      }
    }

    offset += 2 + size;
  }

  return { takenAt: fallbackDate, coordinates: null };
}

function parseTiff(view: DataView, start: number, fallbackDate: Date): PhotoMeta {
  const littleEndian = readAscii(view, start, 2) === "II";
  const firstIfdOffset = readLong(view, start + 4, littleEndian);
  const ifd0 = readIfd(view, start, start + firstIfdOffset, littleEndian);
  const exifOffset = ifd0.get(0x8769)?.valueOffset ?? 0;
  const gpsOffset = ifd0.get(0x8825)?.valueOffset ?? 0;
  const exif = exifOffset ? readIfd(view, start, start + exifOffset, littleEndian) : new Map();
  const gps = gpsOffset ? readIfd(view, start, start + gpsOffset, littleEndian) : new Map();
  const dateString = exif.get(0x9003)?.text ?? exif.get(0x9004)?.text ?? "";
  const takenAt = parseExifDate(dateString) ?? fallbackDate;
  const coordinates = parseGps(view, start, gps, littleEndian);

  return { takenAt, coordinates };
}

function readIfd(view: DataView, tiffStart: number, offset: number, littleEndian: boolean) {
  const entries = new Map<number, { text?: string; valueOffset?: number }>();
  const count = readShort(view, offset, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    const tag = readShort(view, entryOffset, littleEndian);
    const type = readShort(view, entryOffset + 2, littleEndian);
    const countValue = readLong(view, entryOffset + 4, littleEndian);
    const valueOffset = readLong(view, entryOffset + 8, littleEndian);
    const byteCount = countValue * typeByteLength(type);
    const valueStart = byteCount <= 4 ? entryOffset + 8 : tiffStart + valueOffset;

    if (type === 2) {
      entries.set(tag, {
        text: readAscii(view, valueStart, Math.max(0, countValue - 1)),
        valueOffset,
      });
    } else {
      entries.set(tag, { valueOffset });
    }
  }

  return entries;
}

function parseGps(
  view: DataView,
  tiffStart: number,
  gps: Map<number, { text?: string; valueOffset?: number }>,
  littleEndian: boolean,
): Coordinates | null {
  const latRef = gps.get(1)?.text;
  const latOffset = gps.get(2)?.valueOffset;
  const lngRef = gps.get(3)?.text;
  const lngOffset = gps.get(4)?.valueOffset;

  if (!latRef || !latOffset || !lngRef || !lngOffset) {
    return null;
  }

  const lat = rationalDegrees(view, tiffStart + latOffset, littleEndian);
  const lng = rationalDegrees(view, tiffStart + lngOffset, littleEndian);

  if (lat == null || lng == null) {
    return null;
  }

  return {
    lat: latRef === "S" ? -lat : lat,
    lng: lngRef === "W" ? -lng : lng,
    source: "photo",
  };
}

function rationalDegrees(view: DataView, offset: number, littleEndian: boolean) {
  const degrees = readRational(view, offset, littleEndian);
  const minutes = readRational(view, offset + 8, littleEndian);
  const seconds = readRational(view, offset + 16, littleEndian);

  if (degrees == null || minutes == null || seconds == null) {
    return null;
  }

  return degrees + minutes / 60 + seconds / 3600;
}

function parseExifDate(value: string) {
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function readShort(view: DataView, offset: number, littleEndian: boolean) {
  return view.getUint16(offset, littleEndian);
}

function readLong(view: DataView, offset: number, littleEndian: boolean) {
  return view.getUint32(offset, littleEndian);
}

function readRational(view: DataView, offset: number, littleEndian: boolean) {
  const numerator = readLong(view, offset, littleEndian);
  const denominator = readLong(view, offset + 4, littleEndian);
  return denominator === 0 ? null : numerator / denominator;
}

function readAscii(view: DataView, offset: number, length: number) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += String.fromCharCode(view.getUint8(offset + index));
  }
  return output;
}

function typeByteLength(type: number) {
  if (type === 1 || type === 2 || type === 7) return 1;
  if (type === 3) return 2;
  if (type === 4 || type === 9) return 4;
  if (type === 5 || type === 10) return 8;
  return 1;
}
