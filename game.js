// ==========================================
// FILE GAME.JS - Toàn bộ logic Flappy Bird
// ==========================================
const gameCanvas = document.getElementById("game_canvas");
const ctx = gameCanvas.getContext("2d");

const W = gameCanvas.width;   // 420
const H = gameCanvas.height;  // 600
const GROUND_H = 80;
const GROUND_Y = H - GROUND_H;

// Thông số vật lý (đã tinh chỉnh cho cảm giác chơi bằng cử chỉ tay cực mượt)
const GRAVITY = 1350;       // Trọng lực kéo chim rơi xuống
const JUMP_VEL = -420;      // Lực đẩy lên khi chụm tay
const PIPE_SPEED = 165;     // Tốc độ ống di chuyển
const PIPE_WIDTH = 64;      // Chiều rộng ống
const PIPE_GAP = 165;       // Khoảng hở giữa ống trên & dưới
const PIPE_INTERVAL = 1.65; // Cứ 1.65 giây sinh ra 1 cặp ống mới

// Trạng thái game: "READY" (chờ bắt đầu) | "PLAYING" (đang chơi) | "GAMEOVER" (thua)
let state = "READY";
let score = 0;
let bestScore = Number(localStorage.getItem("flappy_hand_best") || 0);
let gameOverTime = 0;

let bird = { x: 110, y: 260, radius: 17, vy: 0 };
let pipes = [];
let spawnTimer = 0;
let groundOffset = 0;
let timeElapsed = 0;

// --- ÂM THANH TỰ TỔNG HỢP (Không cần tải file .mp3) ---
let audioCtx = null;
function phatAmThanh(loai) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;
        if (loai === "jump") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(360, now);
            osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (loai === "score") {
            osc.type = "triangle";
            osc.frequency.setValueAtTime(750, now);
            osc.frequency.setValueAtTime(1050, now + 0.07);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (loai === "hit") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    } catch (e) {
        // Bỏ qua nếu trình duyệt chưa cho phát âm thanh
    }
}

function resetGame() {
    bird = { x: 110, y: 260, radius: 17, vy: 0 };
    pipes = [];
    spawnTimer = 0.6;
    score = 0;
}

function taoOngMoi() {
    const minTop = 65;
    const maxTop = GROUND_Y - PIPE_GAP - 65;
    const topH = Math.random() * (maxTop - minTop) + minTop;
    pipes.push({ x: W + 20, topH: topH, passed: false });
}

function ketThucGame() {
    state = "GAMEOVER";
    gameOverTime = performance.now();
    phatAmThanh("hit");
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("flappy_hand_best", bestScore); // Lưu kỷ lục vào trình duyệt
    }
}

// ======================================================
// HÀM XUẤT RA NGOÀI (EXPORT) ĐỂ SCRIPT.JS GỌI KHI CHỤM TAY!
// ======================================================
export function nhayFlappyBird() {
    if (state === "READY") {
        state = "PLAYING";
        bird.vy = JUMP_VEL;
        phatAmThanh("jump");
    } else if (state === "PLAYING") {
        bird.vy = JUMP_VEL;
        phatAmThanh("jump");
    } else if (state === "GAMEOVER") {
        // Đợi 0.8 giây sau khi thua mới cho chụm tay chơi lại (tránh lỡ bấm nhầm ngay lúc vừa thua)
        if (performance.now() - gameOverTime > 800) {
            resetGame();
            state = "PLAYING";
            bird.vy = JUMP_VEL;
            phatAmThanh("jump");
        }
    }
}

// Hỗ trợ thêm phím Space và Click chuột vào khung game để test nhanh
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        nhayFlappyBird();
    }
});
gameCanvas.addEventListener("mousedown", nhayFlappyBird);

// --- CẬP NHẬT VẬT LÝ GAME THEO THỜI GIAN THỰC (dt) ---
function capNhatGame(dt) {
    timeElapsed += dt;

    if (state === "READY") {
        groundOffset = (groundOffset + PIPE_SPEED * dt) % 24;
        bird.y = 260 + Math.sin(timeElapsed * 5) * 10; // Chim nhấp nhô chờ xuất phát
        return;
    }

    if (state === "PLAYING") {
        groundOffset = (groundOffset + PIPE_SPEED * dt) % 24;

        // Cập nhật vị trí chim theo trọng lực
        bird.vy += GRAVITY * dt;
        bird.y += bird.vy * dt;

        // Không cho chim bay lố lên trên trần
        if (bird.y - bird.radius < 0) {
            bird.y = bird.radius;
            bird.vy = 0;
        }

        // Chạm đất -> Thua
        if (bird.y + bird.radius >= GROUND_Y) {
            bird.y = GROUND_Y - bird.radius;
            ketThucGame();
            return;
        }

        // Sinh ống mới định kỳ
        spawnTimer += dt;
        if (spawnTimer >= PIPE_INTERVAL) {
            spawnTimer = 0;
            taoOngMoi();
        }

        // Di chuyển ống & kiểm tra va chạm + tính điểm
        for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= PIPE_SPEED * dt;

            // Tính điểm khi chim bay qua giữa ống
            if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
                p.passed = true;
                score++;
                phatAmThanh("score");
            }

            // Kiểm tra va chạm (trừ nhẹ 3px để cảm giác né ống mượt và công bằng hơn)
            const hitX = bird.x + bird.radius - 3 > p.x && bird.x - bird.radius + 3 < p.x + PIPE_WIDTH;
            const hitTop = bird.y - bird.radius + 3 < p.topH;
            const hitBottom = bird.y + bird.radius - 3 > p.topH + PIPE_GAP;

            if (hitX && (hitTop || hitBottom)) {
                ketThucGame();
                return;
            }

            // Xóa ống đã trôi khỏi màn hình bên trái
            if (p.x + PIPE_WIDTH < -10) {
                pipes.splice(i, 1);
            }
        }
    }
}

// --- VẼ ĐỒ HỌA GAME ---
function veOng(p) {
    const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
    grad.addColorStop(0, "#55b832");
    grad.addColorStop(0.3, "#9ae65e");
    grad.addColorStop(0.7, "#55b832");
    grad.addColorStop(1, "#3b8720");

    ctx.fillStyle = grad;
    ctx.strokeStyle = "#224a12";
    ctx.lineWidth = 3;

    // Ống trên
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
    ctx.strokeRect(p.x, -3, PIPE_WIDTH, p.topH + 3);
    // Miệng ống trên
    ctx.fillRect(p.x - 4, p.topH - 26, PIPE_WIDTH + 8, 26);
    ctx.strokeRect(p.x - 4, p.topH - 26, PIPE_WIDTH + 8, 26);

    // Ống dưới
    const bottomY = p.topH + PIPE_GAP;
    const bottomH = GROUND_Y - bottomY;
    ctx.fillRect(p.x, bottomY, PIPE_WIDTH, bottomH);
    ctx.strokeRect(p.x, bottomY, PIPE_WIDTH, bottomH + 3);
    // Miệng ống dưới
    ctx.fillRect(p.x - 4, bottomY, PIPE_WIDTH + 8, 26);
    ctx.strokeRect(p.x - 4, bottomY, PIPE_WIDTH + 8, 26);
}

function veChim() {
    ctx.save();
    ctx.translate(bird.x, bird.y);

    // Xoay góc chúi đầu / ngẩng đầu theo tốc độ rơi
    const gocXoay = state === "READY" ? 0 : Math.max(-0.5, Math.min(1.2, bird.vy / 450));
    ctx.rotate(gocXoay);

    // Thân chim màu vàng
    ctx.beginPath();
    ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd60a";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#333";
    ctx.stroke();

    // Bụng sáng
    ctx.beginPath();
    ctx.arc(-2, 5, 10, 0, Math.PI);
    ctx.fillStyle = "#fff3b0";
    ctx.fill();

    // Cánh vẫy
    const wingY = state === "GAMEOVER" ? 2 : Math.sin(timeElapsed * 18) * 4;
    ctx.beginPath();
    ctx.ellipse(-6, 2 + wingY, 9, 6, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();

    // Mắt
    ctx.beginPath();
    ctx.arc(7, -5, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(9, -5, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();

    // Mỏ cam
    ctx.beginPath();
    ctx.moveTo(13, -1);
    ctx.lineTo(24, 3);
    ctx.lineTo(13, 8);
    ctx.closePath();
    ctx.fillStyle = "#ff5400";
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function veGame() {
    // 1. Nền bầu trời chuyển sắc
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#38b6ff");
    sky.addColorStop(1, "#a8e6ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // 2. Vẽ vài đám mây trôi nhẹ
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    for (let i = 0; i < 3; i++) {
        const cx = ((i * 170 - timeElapsed * 20) % (W + 100) + W + 100) % (W + 100) - 50;
        const cy = 90 + (i % 2) * 55;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.arc(cx + 20, cy - 8, 26, 0, Math.PI * 2);
        ctx.arc(cx + 42, cy, 20, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Vẽ các ống nước
    for (const p of pipes) veOng(p);

    // 4. Vẽ mặt đất chạy liên tục
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, GROUND_Y, W, GROUND_H);
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(0, GROUND_Y, W, 18);
    ctx.strokeStyle = "#3b6e13";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // Sọc chéo trên dải cỏ
    ctx.fillStyle = "#599e1d";
    for (let x = -24; x < W + 24; x += 24) {
        ctx.fillRect(x - groundOffset, GROUND_Y + 3, 12, 12);
    }

    // 5. Vẽ chim
    veChim();

    // 6. Vẽ điểm số hiện tại to rõ ở giữa trên
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 5;
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.strokeText(score, W / 2, 70);
    ctx.fillText(score, W / 2, 70);

    // 7. Màn hình hướng dẫn READY / GAME OVER
    if (state === "READY") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(45, 330, W - 90, 90);
        ctx.fillStyle = "#ffdd57";
        ctx.font = "bold 22px Arial";
        ctx.fillText("👌 CHỤM NGÓN TAY ĐỂ BAY!", W / 2, 368);
        ctx.fillStyle = "#ffffff";
        ctx.font = "15px Arial";
        ctx.fillText("(Hoặc bấm phím Space / Click chuột)", W / 2, 400);
    } else if (state === "GAMEOVER") {
        ctx.fillStyle = "rgba(20, 20, 35, 0.85)";
        ctx.fillRect(55, 180, W - 110, 210);
        ctx.strokeStyle = "#00ffcc";
        ctx.lineWidth = 3;
        ctx.strokeRect(55, 180, W - 110, 210);

        ctx.fillStyle = "#ff4d6d";
        ctx.font = "bold 36px Arial";
        ctx.fillText("GAME OVER", W / 2, 232);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px Arial";
        ctx.fillText(`Điểm của bạn: ${score}`, W / 2, 280);
        ctx.fillStyle = "#ffdd57";
        ctx.fillText(`🏆 Kỷ lục: ${bestScore}`, W / 2, 315);

        ctx.fillStyle = "#00ffcc";
        ctx.font = "16px Arial";
        ctx.fillText("👌 Chụm tay lần nữa để chơi lại!", W / 2, 360);
    }
}

// --- VÒNG LẶP GAME (CHUẨN TỐC ĐỘ TRÊN MỌI MÀN HÌNH 60Hz / 144Hz) ---
let lastTime = 0;
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    capNhatGame(dt);
    veGame();

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);