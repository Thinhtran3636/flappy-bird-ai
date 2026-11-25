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

    canvasCtx.save();

    canvasCtx.beginPath();
    for (const ketNoi of HandLandmarker.HAND_CONNECTIONS) {
        const diemDau = banTay[ketNoi.start];
        const diemCuoi = banTay[ketNoi.end];
        canvasCtx.moveTo(diemDau.x * w, diemDau.y * h);
        canvasCtx.lineTo(diemCuoi.x * w, diemCuoi.y * h);
    }
    canvasCtx.strokeStyle = "rgba(0, 245, 255, 0.85)";
    canvasCtx.lineWidth = 3;
    canvasCtx.lineCap = "round";
    canvasCtx.shadowColor = "#00f5ff";
    canvasCtx.shadowBlur = 12;
    canvasCtx.stroke();

    const cacDauNgonTay = [4, 8, 12, 16, 20];
    banTay.forEach((diem, chiSo) => {
        const x = diem.x * w;
        const y = diem.y * h;
        const laDauNgon = cacDauNgonTay.includes(chiSo);

        canvasCtx.beginPath();
        canvasCtx.arc(x, y, laDauNgon ? 6 : 3.5, 0, Math.PI * 2);

        if (laDauNgon) {
            canvasCtx.fillStyle = "#ffffff";
            canvasCtx.strokeStyle = "#ff2e93";
            canvasCtx.lineWidth = 2.5;
            canvasCtx.shadowColor = "#ff2e93";
            canvasCtx.shadowBlur = 15;
            canvasCtx.fill();
            canvasCtx.stroke();
        } else {
            canvasCtx.fillStyle = "#ffffff";
            canvasCtx.shadowColor = "#00f5ff";
            canvasCtx.shadowBlur = 8;
            canvasCtx.fill();
        }
    });

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