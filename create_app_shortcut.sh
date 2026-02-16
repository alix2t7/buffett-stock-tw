#!/bin/zsh
# ─────────────────────────────────────────────
# 建立 macOS 桌面捷徑 App
# 執行一次即可：sh create_app_shortcut.sh
# ─────────────────────────────────────────────

APP_NAME="持股儀表板"
APP_DIR="$HOME/Desktop/${APP_NAME}.app"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "📦 建立桌面 App 捷徑: ${APP_NAME}.app"

# 建立 .app 結構
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# ── Info.plist ──
cat > "${APP_DIR}/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.local.stock-dashboard</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundleIconFile</key>
    <string>app.icns</string>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
PLIST

# ── 啟動腳本 ──
cat > "${APP_DIR}/Contents/MacOS/launch" << LAUNCHER
#!/bin/zsh

# ── Finder 啟動時 PATH 僅有 /usr/bin:/bin:/usr/sbin:/sbin ──
# 必須手動加入 node/npm 所在路徑
export PATH="/usr/local/bin:/opt/homebrew/bin:\$PATH"

# ── Debug log（寫入專案 logs/ 目錄）──
mkdir -p "${PROJECT_DIR}/logs"
LOG_FILE="${PROJECT_DIR}/logs/launch_debug.log"
exec > "\$LOG_FILE" 2>&1
echo "=== Launch: \$(date) ==="

PORT=3000
URL="http://localhost:\$PORT"
PROJECT="${PROJECT_DIR}"

# ── 自動啟用 Python venv（如果存在）──
if [ -f "\$PROJECT/.venv/bin/activate" ]; then
    source "\$PROJECT/.venv/bin/activate"
fi

# ── 檢查專案目錄 ──
if [ ! -d "\$PROJECT" ]; then
    echo "ERROR: Project not found: \$PROJECT"
    /usr/bin/osascript -e 'display dialog "專案目錄不存在" with title "持股儀表板" buttons {"確定"} default button 1 with icon stop'
    exit 1
fi

# ── 檢查 node ──
if ! command -v node > /dev/null 2>&1; then
    echo "ERROR: node not found"
    /usr/bin/osascript -e 'display dialog "Node.js 未安裝" with title "持股儀表板" buttons {"確定"} default button 1 with icon stop'
    exit 1
fi
echo "node=\$(which node) (\$(node --version))"

# ── 如果 port 已被佔用 ──
if lsof -ti:\$PORT > /dev/null 2>&1; then
    PORT_CMD=\$(lsof -ti:\$PORT | head -1 | xargs ps -o comm= -p 2>/dev/null || echo "unknown")
    echo "Port \$PORT occupied by: \$PORT_CMD"

    if echo "\$PORT_CMD" | grep -qi "node"; then
        # 是我們的 Vite 伺服器 → 直接開瀏覽器
        echo "Detected existing Vite server — opening browser"
        /usr/bin/open "\$URL"
        exit 0
    else
        # 是其他程式佔用 → 詢問使用者
        CHOICE=\$(/usr/bin/osascript -e 'display dialog "Port 3000 被其他程式佔用（'""\$PORT_CMD""'）\n要自動清除佔用並啟動儀表板嗎？" with title "持股儀表板" buttons {"取消", "清除並啟動"} default button 2 cancel button "取消"' 2>&1) || {
            echo "User cancelled"
            exit 0
        }
        echo "Killing processes on port \$PORT..."
        lsof -ti:\$PORT | xargs kill -9 2>/dev/null
        sleep 1
    fi
fi

# ── 啟動 server ──
cd "\$PROJECT"
echo "Working dir: \$(pwd)"

# ── 自動建立 stock_config.local.json ──
CONFIG_LOCAL="\$PROJECT/stock_config.local.json"
CONFIG_EXAMPLE="\$PROJECT/stock_config.example.json"
if [ ! -f "\$CONFIG_LOCAL" ] && [ -f "\$CONFIG_EXAMPLE" ]; then
    echo "stock_config.local.json not found — copying from example"
    cp "\$CONFIG_EXAMPLE" "\$CONFIG_LOCAL"
    /usr/bin/osascript -e 'display dialog "已自動建立 stock_config.local.json（預設 3 支範例股票）。\n\n請編輯此檔案填入你的持股代碼，然後點「⚙ 同步持股」。\n\n檔案位置：\n'"\$CONFIG_LOCAL"'" with title "持股儀表板 — 首次設定" buttons {"了解"} default button 1 with icon note'
fi

if [ ! -d "node_modules" ]; then
    echo "Installing deps..."
    /usr/bin/osascript -e 'display notification "正在安裝依賴..." with title "持股儀表板"'
    npm install 2>&1
fi

# ── 自動同步：若 stock_data.json 不存在或超過 7 天未更新 ──
DATA_FILE="\$PROJECT/public/stock_data.json"
NEED_SYNC=0
if [ ! -f "\$DATA_FILE" ]; then
    echo "stock_data.json not found — will auto-sync"
    NEED_SYNC=1
elif [ \$(find "\$DATA_FILE" -mtime +7 2>/dev/null | wc -l) -gt 0 ]; then
    echo "stock_data.json older than 7 days — will auto-sync"
    NEED_SYNC=1
fi

if [ \$NEED_SYNC -eq 1 ]; then
    /usr/bin/osascript -e 'display notification "首次同步持股資料中，請稍候約 30 秒..." with title "持股儀表板"'
    echo "Running sync_portfolio.py --refresh ..."
    python3 sync_portfolio.py --refresh 2>&1 || echo "WARN: sync failed"
    echo "Sync finished"
fi

/usr/bin/osascript -e 'display notification "伺服器啟動中..." with title "持股儀表板"'

echo "Starting Vite..."
npx vite --port \$PORT 2>&1 &
SERVER_PID=\$!

# ── 等待 server 就緒 ──
READY=0
for i in {1..30}; do
    if curl -s "http://localhost:\$PORT" > /dev/null 2>&1; then
        READY=1
        echo "Server ready after \$i checks"
        /usr/bin/open "\$URL"
        /usr/bin/osascript -e 'display notification "儀表板已開啟！" with title "持股儀表板"'
        break
    fi
    sleep 0.5
done

if [ \$READY -eq 0 ]; then
    echo "ERROR: Server failed to start"
    /usr/bin/osascript -e 'display dialog "伺服器啟動失敗" with title "持股儀表板" buttons {"確定"} default button 1 with icon stop'
    kill \$SERVER_PID 2>/dev/null
    exit 1
fi

echo "=== Monitoring browser connections ==="

# ── 等瀏覽器建立連線（給 10 秒）──
sleep 10

# ── 偵測瀏覽器關閉 → 自動停止伺服器 ──
IDLE_COUNT=0
while kill -0 \$SERVER_PID 2>/dev/null; do
    CONNS=\$(lsof -i:\$PORT -sTCP:ESTABLISHED 2>/dev/null | grep -c -v '^COMMAND')
    echo "\$(date +%H:%M:%S) connections=\$CONNS idle=\$IDLE_COUNT"

    if [ "\$CONNS" -eq 0 ]; then
        IDLE_COUNT=\$((IDLE_COUNT + 1))
    else
        IDLE_COUNT=0
    fi

    # 連續 2 次（10 秒）無連線 → 關閉
    if [ "\$IDLE_COUNT" -ge 2 ]; then
        echo "No browser connected — shutting down"
        /usr/bin/osascript -e 'display notification "瀏覽器已關閉，伺服器已自動停止" with title "持股儀表板"'
        kill \$SERVER_PID 2>/dev/null
        wait \$SERVER_PID 2>/dev/null
        break
    fi

    sleep 5
done

echo "=== Server exited: \$(date) ==="
LAUNCHER

chmod +x "${APP_DIR}/Contents/MacOS/launch"

# ── 生成 icon（用 Python 畫一個簡單的圖表 icon）──
echo "🎨 生成 App 圖示..."

python3 << 'PYICON'
import struct, zlib, os, sys

def create_png(width, height, pixels):
    """Create a minimal PNG from RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter none
        for x in range(width):
            raw += bytes(pixels[y][x])
    
    compressed = zlib.compress(raw)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    return png

size = 256
pixels = [[(0,0,0,0)] * size for _ in range(size)]

# Background: rounded dark blue
cx, cy = size // 2, size // 2
r = size // 2 - 8
for y in range(size):
    for x in range(size):
        dx, dy = x - cx, y - cy
        dist = (dx*dx + dy*dy) ** 0.5
        if dist < r:
            # dark gradient
            t = y / size
            rb = int(15 + t * 10)
            g = int(22 + t * 15)
            b = int(42 + t * 20)
            pixels[y][x] = (rb, g, b, 255)
        elif dist < r + 2:
            pixels[y][x] = (59, 130, 246, 128)  # blue edge

# Bar chart bars
bars = [0.35, 0.55, 0.45, 0.75, 0.65, 0.85, 0.70]
colors = [
    (34, 197, 94),   # green
    (59, 130, 246),  # blue
    (168, 85, 247),  # purple
    (34, 197, 94),
    (59, 130, 246),
    (251, 191, 36),  # yellow
    (34, 197, 94),
]
bar_w = 22
gap = 6
total_w = len(bars) * (bar_w + gap) - gap
start_x = (size - total_w) // 2
base_y = size - 60

for i, (h, color) in enumerate(zip(bars, colors)):
    bx = start_x + i * (bar_w + gap)
    bar_h = int(h * 120)
    for y in range(base_y - bar_h, base_y):
        for x in range(bx, bx + bar_w):
            dx_c = x - cx
            dy_c = y - cy
            if (dx_c*dx_c + dy_c*dy_c) ** 0.5 < r - 4:
                # gradient within bar
                t = (base_y - y) / bar_h
                cr = int(color[0] * (0.6 + 0.4 * t))
                cg = int(color[1] * (0.6 + 0.4 * t))
                cb = int(color[2] * (0.6 + 0.4 * t))
                pixels[y][x] = (min(cr,255), min(cg,255), min(cb,255), 230)

# Trend line (upward)
import math
points = [(0.0, 0.6), (0.15, 0.5), (0.3, 0.55), (0.5, 0.35), (0.7, 0.3), (0.85, 0.15), (1.0, 0.1)]
line_x0 = start_x
line_w = total_w

for pi in range(len(points) - 1):
    x1f, y1f = points[pi]
    x2f, y2f = points[pi + 1]
    steps = 100
    for s in range(steps):
        t = s / steps
        fx = line_x0 + (x1f + t * (x2f - x1f)) * line_w
        fy = 50 + (y1f + t * (y2f - y1f)) * 100
        ix, iy = int(fx), int(fy)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                py, px = iy + dy, ix + dx
                if 0 <= py < size and 0 <= px < size:
                    d2 = dx*dx + dy*dy
                    if d2 <= 4:
                        dc = ((px-cx)**2 + (py-cy)**2) ** 0.5
                        if dc < r - 4:
                            alpha = int(255 * max(0, 1 - d2/5))
                            pixels[py][px] = (251, 191, 36, alpha)

# "$" symbol top-left
dollar = [
    "  ##  ",
    " #### ",
    "## ## ",
    " ###  ",
    " ## ##",
    " #### ",
    "  ##  ",
]
dollar_x, dollar_y = 55, 40
for ry, row in enumerate(dollar):
    for rx, ch in enumerate(row):
        if ch == '#':
            px, py = dollar_x + rx * 3, dollar_y + ry * 3
            for dy in range(3):
                for dx in range(3):
                    ppx, ppy = px + dx, py + dy
                    if 0 <= ppy < size and 0 <= ppx < size:
                        dc = ((ppx-cx)**2 + (ppy-cy)**2) ** 0.5
                        if dc < r - 4:
                            pixels[ppy][ppx] = (251, 191, 36, 220)

png_data = create_png(size, size, pixels)

app_dir = os.path.expanduser("~/Desktop/持股儀表板.app/Contents/Resources")
png_path = os.path.join(app_dir, "app.png")
with open(png_path, 'wb') as f:
    f.write(png_data)

print(f"✅ PNG icon 已建立 ({size}x{size})")
PYICON

# 用 sips 將 PNG 轉為 icns
PNG_PATH="${APP_DIR}/Contents/Resources/app.png"
ICONSET_DIR="${APP_DIR}/Contents/Resources/app.iconset"

if [ -f "$PNG_PATH" ]; then
    mkdir -p "$ICONSET_DIR"
    # 生成各尺寸
    for sz in 16 32 64 128 256; do
        sips -z $sz $sz "$PNG_PATH" --out "${ICONSET_DIR}/icon_${sz}x${sz}.png" > /dev/null 2>&1
    done
    for sz in 16 32 128 256; do
        dbl=$((sz * 2))
        sips -z $dbl $dbl "$PNG_PATH" --out "${ICONSET_DIR}/icon_${sz}x${sz}@2x.png" > /dev/null 2>&1
    done
    # 生成 icns
    iconutil -c icns "$ICONSET_DIR" -o "${APP_DIR}/Contents/Resources/app.icns" 2>/dev/null
    rm -rf "$ICONSET_DIR" "$PNG_PATH"
    echo "✅ App 圖示已生成"
fi

echo ""
echo "════════════════════════════════════"
echo "✅ ${APP_NAME}.app 已建立在桌面！"
echo ""
echo "📌 使用方式："
echo "   • 雙擊桌面上的 ${APP_NAME}.app 即可啟動"
echo "   • 可拖到 Dock 常駐"
echo "   • 關閉方式：Activity Monitor 搜尋 vite 並結束"
echo "════════════════════════════════════"
