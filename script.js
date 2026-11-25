import { nhayFlappyBird } from "./game.js";
import {
    FilesetResolver,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs";

const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const statusText = document.getElementById("status");
const jumpBox = document.getElementById("jump-box");
const gestureStateText = document.getElementById("gesture-state");
const jumpCountText = document.getElementById("jump-count");
const ratioText = document.getElementById("ratio-text");

let handLandmarker = null;
let lastVideoTime = -1;

// --- BIẾN LOGIC CỬ CHỈ (PHIÊN BẢN TỐI ƯU CHỐNG NHIỄU & BIÊN ĐỘ NHỎ) ---
let dangChumTay = false;
let soLanNhay = 0;
let tyLeMuot = 0.5;          // Tỷ lệ sau khi đã lọc mượt bằng bộ lọc EMA
let lanNhayCuoi = 0;         // Thời điểm lần nhảy gần nhất (ms)
let soKhungHinhMatTay = 0;   // Đếm số khung hình bị mất dấu thoáng qua

// 1. Thu hẹp khoảng cách 2 ngưỡng để bắt cực nhạy ngay cả khi biên độ mở ngón tay NHỎ
const NGUONG_CHUM = 0.24;    // < 0.24 => CHỤM (NHẢY!)
const NGUONG_MO = 0.31;      // > 0.31 => MỞ (sẵn sàng cho lần nhảy tiếp theo)

// 2. Thời gian nghỉ tối thiểu giữa 2 lần nhảy (chống nhảy đúp khi bị che khuất)
const THOI_GIAN_CHO_MS = 160;

// 3. Hệ số làm mượt EMA (0.55: vừa khử nhiễu tốt, vừa phản hồi siêu nhanh)
const HE_SO_MUOT = 0.55;

function tinhKhoangCach(diem1, diem2, w, h) {
    const dx = (diem1.x - diem2.x) * w;
    const dy = (diem1.y - diem2.y) * h;
    return Math.hypot(dx, dy);
}

function khiNguoiChoiNhay() {
    soLanNhay++;
    jumpCountText.innerText = soLanNhay;
    gestureStateText.innerText = "🐦 NHẢY!";
    jumpBox.classList.add("active-jump");
    nhayFlappyBird();
}

function xuLyCuChi(banTay) {
    const w = canvasElement.width;
    const h = canvasElement.height;

    const coTay = banTay[0];    // Điểm 0: Cổ tay
    const ngonCai = banTay[4];  // Điểm 4: Đầu ngón cái
    const gocTro = banTay[5];   // Điểm 5: Khớp gốc ngón trỏ
    const ngonTro = banTay[8];  // Điểm 8: Đầu ngón trỏ
    const gocGiua = banTay[9];  // Điểm 9: Khớp gốc ngón giữa
    const gocUt = banTay[17];   // Điểm 17: Khớp gốc ngón út

    // 1. Khoảng cách giữa đầu ngón cái & đầu ngón trỏ
    const khoangCachChum = tinhKhoangCach(ngonCai, ngonTro, w, h);

    // 2. Thước đo KÉP (dọc + ngang lòng bàn tay) -> Không bị méo khi khum/nghiêng tay!
    const chieuDocTay = tinhKhoangCach(coTay, gocGiua, w, h);
    const chieuNgangTay = tinhKhoangCach(gocTro, gocUt, w, h) * 1.25;
    const kichThuocTay = Math.max(chieuDocTay, chieuNgangTay, 1);

    // 3. Tính tỷ lệ thô rồi lọc mượt bằng bộ lọc EMA để triệt tiêu rung giật
    const tyLeTho = khoangCachChum / kichThuocTay;
    tyLeMuot = HE_SO_MUOT * tyLeTho + (1 - HE_SO_MUOT) * tyLeMuot;
    ratioText.innerText = tyLeMuot.toFixed(2);

    // 4. Kích hoạt nhảy (kết hợp Cooldown chống nhảy đúp)
    const bayGio = performance.now();
    if (!dangChumTay && tyLeMuot < NGUONG_CHUM && (bayGio - lanNhayCuoi > THOI_GIAN_CHO_MS)) {
        dangChumTay = true;
        lanNhayCuoi = bayGio;
        khiNguoiChoiNhay();
    } else if (dangChumTay && tyLeMuot > NGUONG_MO) {
        dangChumTay = false;
        gestureStateText.innerText = "Đang mở";
        jumpBox.classList.remove("active-jump");
    }

    // 5. Vẽ sợi dây năng lượng nối ngón cái & ngón trỏ
    canvasCtx.save();
    canvasCtx.beginPath();
    canvasCtx.moveTo(ngonCai.x * w, ngonCai.y * h);
    canvasCtx.lineTo(ngonTro.x * w, ngonTro.y * h);
    canvasCtx.strokeStyle = dangChumTay ? "#00ff88" : "#ffdd57";
    canvasCtx.lineWidth = dangChumTay ? 5 : 2.5;
    canvasCtx.shadowColor = dangChumTay ? "#00ff88" : "#ffdd57";
    canvasCtx.shadowBlur = 12;
    canvasCtx.stroke();
    canvasCtx.restore();
}

function veKhungXuongDep(banTay) {
    const w = canvasElement.width;
    const h = canvasElement.height;
    const scale = Math.max(0.8, w / 640); // Tự co giãn độ nét chuẩn theo độ phân giải webcam

    canvasCtx.save();
    // Chế độ cộng hưởng ánh sáng (giúp hào quang tỏa sáng lung linh y như ảnh mẫu)
    canvasCtx.globalCompositeOperation = "lighter";

    // 1. Vẽ các đường xương siêu mảnh màu trắng ánh hồng phát sáng dịu
    canvasCtx.beginPath();
    for (const ketNoi of HandLandmarker.HAND_CONNECTIONS) {
        const d1 = banTay[ketNoi.start];
        const d2 = banTay[ketNoi.end];
        canvasCtx.moveTo(d1.x * w, d1.y * h);
        canvasCtx.lineTo(d2.x * w, d2.y * h);
    }
    canvasCtx.strokeStyle = "rgba(255, 240, 246, 0.85)";
    canvasCtx.lineWidth = 1.6 * scale;
    canvasCtx.lineCap = "round";
    canvasCtx.shadowColor = "rgba(255, 145, 180, 0.95)";
    canvasCtx.shadowBlur = 10 * scale;
    canvasCtx.stroke();

    // Tắt shadowBlur trước khi vẽ 21 lớp hào quang để giữ mượt 60 FPS
    canvasCtx.shadowBlur = 0;

    // 2. Vẽ 21 đốm sáng trắng tỏa hào quang hồng phấn tại từng khớp tay
    const rHalo = 16 * scale;
    const rCore = 2.6 * scale;

    for (const diem of banTay) {
        const x = diem.x * w;
        const y = diem.y * h;

        // Vầng hào quang tỏa tròn mờ dần từ tâm trắng -> hồng phấn -> trong suốt
        const halo = canvasCtx.createRadialGradient(x, y, 0, x, y, rHalo);
        halo.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        halo.addColorStop(0.22, "rgba(255, 225, 236, 0.78)");
        halo.addColorStop(0.55, "rgba(255, 150, 185, 0.28)");
        halo.addColorStop(1, "rgba(255, 130, 170, 0)");

        canvasCtx.beginPath();
        canvasCtx.arc(x, y, rHalo, 0, Math.PI * 2);
        canvasCtx.fillStyle = halo;
        canvasCtx.fill();

        // Lõi sáng trắng tinh ở chính giữa khớp
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, rCore, 0, Math.PI * 2);
        canvasCtx.fillStyle = "#ffffff";
        canvasCtx.fill();
    }

    canvasCtx.restore();
}
async function khoiTaoAI() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        // Nâng độ tin cậy để AI không nhận nhầm khi các ngón tay chồng lên nhau
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6
    });

    statusText.innerText = "✅ AI đã sẵn sàng! Hãy chụm ngón cái & ngón trỏ để chơi.";
}

async function batWebcam() {
    const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" } // Luôn ưu tiên mở Camera trước (Selfie)
});
    videoElement.srcObject = stream;
    videoElement.addEventListener("loadeddata", duDoanLienTuc);
}

function duDoanLienTuc() {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    if (handLandmarker && videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        const results = handLandmarker.detectForVideo(videoElement, performance.now());

        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        if (results.landmarks && results.landmarks.length > 0) {
            soKhungHinhMatTay = 0;
            const banTay = results.landmarks[0];
            veKhungXuongDep(banTay);
            xuLyCuChi(banTay);
        } else {
            // Chỉ reset nếu mất dấu tay lâu hơn 15 khung hình (~0.25s)
            soKhungHinhMatTay++;
            if (soKhungHinhMatTay > 15) {
                dangChumTay = false;
                tyLeMuot = 0.5;
                gestureStateText.innerText = "Không thấy tay";
                jumpBox.classList.remove("active-jump");
            }
        }
    }

    requestAnimationFrame(duDoanLienTuc);
}

async function chayChuongTrinh() {
    try {
        await khoiTaoAI();
        await batWebcam();
    } catch (error) {
        console.error(error);
        statusText.innerText = "❌ Có lỗi xảy ra! Bấm F12 -> Console để xem lỗi.";
    }
}

chayChuongTrinh();