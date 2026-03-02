/**
 * Zdog Cat Paw Cursor Effect (Vanilla JS - Vertical Strike Version)
 * 垂直重擊版：維持懸停傾角，拍下時強制垂直(0度)，印章回歸正向與米白色
 */
class CatPawEffect {
    constructor(options = {}) {
        this.size = options.size || 50;

        // 殘留的 3D 腳印改回米白色
        this.padPrintColor = options.padPrintColor || '#F5F5EC';
        // UI 的肉球維持粉嫩色
        this.cursorPadColor = options.cursorPadColor || '#FFA1B8';
        this.pawBaseColor = options.pawBaseColor || '#404040';

        this.maxPrintLifeTime = options.maxPrintLifeTime || 2000;
        this.padList = [];
        this.DEFAULT_SHAPE_SIZE = 80;

        this.pos = { x: -100, y: -100 };
        this.target = { x: -100, y: -100 };
        this.vel = { x: 0, y: 0 };

        // 全域基礎角度：懸停時保持逆時針 34 度 (-9 - 25 = -34)
        this.angle = -34;
        this.isPressed = false;

        this.initCursorHider();
        this.initCanvas();
        this.initZdog();
        this.initAccurateCursor();
        this.bindEvents();
        this.animate();
    }

    initCursorHider() {
        const style = document.createElement('style');
        style.innerHTML = `
            * { cursor: none !important; }
            html, body { cursor: none !important; }
        `;
        document.head.appendChild(style);
    }

    initCanvas() {
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: '9999'
        });
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        document.body.appendChild(this.canvas);

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.illo.updateRenderGraph();
        });
    }

    initZdog() {
        this.illo = new Zdog.Illustration({
            element: this.canvas,
            dragRotate: false,
        });
    }

    initAccurateCursor() {
        this.redDot = document.createElement('div');
        Object.assign(this.redDot.style, {
            position: 'fixed', pointerEvents: 'none',
            zIndex: '10001',
            width: '5px', height: '5px',
            backgroundColor: '#ff0000', borderRadius: '50%',
            boxShadow: '0 0 7px 3px rgba(255, 0, 0, 0.7)',
            transform: 'translate(-50%, -50%)',
            top: '0px', left: '0px'
        });
        document.body.appendChild(this.redDot);

        const ratio = this.size / 80;

        // 灰色手臂容器
        this.catArm = document.createElement('div');
        Object.assign(this.catArm.style, {
            position: 'fixed', pointerEvents: 'none',
            zIndex: '10005',
            width: `${68 * ratio}px`,
            height: `${136 * ratio}px`,
            backgroundColor: this.pawBaseColor,
            borderRadius: `${34 * ratio}px`,
            transformStyle: 'preserve-3d',
            perspective: '500px',
            top: '0px', left: '0px',
            transform: 'translate(-100px, -100px)'
        });

        // 內部肉墊座標
        this.catArm.innerHTML = `
            <div id="paw-pads" style="width: 100%; height: 100%; transition: opacity 0.05s;">
                <div style="position:absolute; width: ${45 * ratio}px; height: ${40 * ratio}px; background: ${this.cursorPadColor}; border-radius: 50%; top: ${38 * ratio}px; left: ${11.5 * ratio}px;"></div>
                <div style="position:absolute; width: ${35 * ratio}px; height: ${40 * ratio}px; background: ${this.cursorPadColor}; border-radius: 50%; top: ${35 * ratio}px; left: ${16.5 * ratio}px;"></div>

                <div style="position:absolute; width: ${10 * ratio}px; height: ${20 * ratio}px; background: ${this.cursorPadColor}; border-radius: 50%; top: ${18 * ratio}px; left: ${49 * ratio}px;"></div>
                <div style="position:absolute; width: ${10 * ratio}px; height: ${20 * ratio}px; background: ${this.cursorPadColor}; border-radius: 50%; top: ${8 * ratio}px; left: ${37 * ratio}px;"></div>
                <div style="position:absolute; width: ${10 * ratio}px; height: ${20 * ratio}px; background: ${this.cursorPadColor}; border-radius: 50%; top: ${8 * ratio}px; left: ${21 * ratio}px;"></div>
                <div style="position:absolute; width: ${10 * ratio}px; height: ${20 * ratio}px; background: ${this.cursorPadColor}; border-radius: 50%; top: ${18 * ratio}px; left: ${9 * ratio}px;"></div>
            </div>
        `;
        document.body.appendChild(this.catArm);
    }

    getValue(baseValue) {
        return baseValue * (this.size / this.DEFAULT_SHAPE_SIZE);
    }

    createPaw(absoluteX, absoluteY) {
        const group = new Zdog.Group({
            addTo: this.illo,
            translate: {
                x: absoluteX - window.innerWidth / 2,
                y: absoluteY - window.innerHeight / 2 + this.getValue(20),
            },
            // 【修正點 1】印章完全垂直 (0度)
            rotate: { z: 0 },
        });

        // 使用 padPrintColor (米白色) 繪製 3D 印章
        new Zdog.Hemisphere({ addTo: group, translate: { y: this.getValue(-10), z: this.getValue(38) }, color: this.padPrintColor, stroke: 0, width: this.getValue(45), height: this.getValue(40) });
        new Zdog.Hemisphere({ addTo: group, translate: { y: this.getValue(-13), z: this.getValue(38) }, color: this.padPrintColor, stroke: 0, width: this.getValue(35), height: this.getValue(40) });

        const toes = [[20, -40], [8, -50], [-8, -50], [-20, -40]];
        toes.forEach(([tx, ty]) => {
            new Zdog.Hemisphere({ addTo: group, translate: { x: this.getValue(tx), y: this.getValue(ty), z: this.getValue(38) }, color: this.padPrintColor, width: this.getValue(10), height: this.getValue(20) });
        });

        return {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
            group: group,
            createdAt: performance.now()
        };
    }

    hexToRgba(hex, alpha = 1) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        const hexNumber = parseInt(hex, 16);
        return `rgba(${(hexNumber >> 16) & 255},${(hexNumber >> 8) & 255},${hexNumber & 255},${alpha})`;
    }

    bindEvents() {
        window.addEventListener('mousemove', (e) => {
            this.target.x = e.clientX;
            this.target.y = e.clientY;

            this.redDot.style.left = `${this.target.x}px`;
            this.redDot.style.top = `${this.target.y}px`;
        });

        window.addEventListener('mousedown', (e) => {
            this.isPressed = true;
            const pad = this.createPaw(e.clientX + window.scrollX, e.clientY + window.scrollY);
            this.padList.push(pad);
            this.illo.updateRenderGraph();
        });

        window.addEventListener('mouseup', () => {
            this.isPressed = false;
        });

        window.addEventListener('scroll', () => {
            this.illo.translate.x = window.scrollX;
            this.illo.translate.y = -window.scrollY;
            this.illo.updateRenderGraph();
        });
    }

    animate() {
        const now = performance.now();
        const ratio = this.size / 80;

        if (!this.isPressed) {
            // [懸停狀態] 保持自然的傾斜角度
            const dx = this.target.x - this.pos.x;
            const dy = this.target.y - this.pos.y;

            this.vel.x = dx * 0.3;
            this.vel.y = dy * 0.3;

            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;

            let targetAngle = -34 + (this.vel.x * -0.5);
            targetAngle = Math.max(-50, Math.min(-15, targetAngle));
            this.angle += (targetAngle - this.angle) * 0.3;

            this.catArm.style.transform = `translate(${this.pos.x + 25}px, ${this.pos.y + 25}px) rotateY(0deg) rotateZ(${this.angle}deg) scale(1)`;
            this.catArm.querySelector('#paw-pads').style.opacity = '1';

        } else {
            // [打擊狀態]
            this.pos.x = this.target.x;
            this.pos.y = this.target.y;

            // 【修正點 2】因為旋轉角度變回 0 度，重新計算偏移量以確保肉球正中心壓在紅點上
            const offsetX = 34 * ratio; // 容器寬度(68)的一半
            const offsetY = 58 * ratio; // 肉墊幾何中心 (38 + 半高20 = 58)

            // 【修正點 3】強制 rotateZ(0deg) 使其垂直拍下
            this.catArm.style.transform = `translate(${this.pos.x - offsetX}px, ${this.pos.y - offsetY}px) rotateY(-180deg) rotateZ(0deg) scale(1)`;
            this.catArm.querySelector('#paw-pads').style.opacity = '0';
        }

        // Zdog 掌印衰減邏輯
        for (let i = this.padList.length - 1; i >= 0; i--) {
            const pad = this.padList[i];
            const deltaTime = now - pad.createdAt;

            if (deltaTime > this.maxPrintLifeTime - 1000) {
                const opacity = Math.max(0, 1 - (deltaTime - (this.maxPrintLifeTime - 1000)) / 1000);
                pad.group.children.forEach(child => {
                    if (child instanceof Zdog.Hemisphere) child.color = this.hexToRgba(this.padPrintColor, opacity);
                });
            }

            if (deltaTime > this.maxPrintLifeTime) {
                pad.group.remove();
                this.padList.splice(i, 1);
            }
        }

        this.illo.updateRenderGraph();
        requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new CatPawEffect({
        size: 33,
        padPrintColor: '#F5F5EC',  // 殘留的印章改為米白色
        cursorPadColor: '#FFA1B8', // 游標的肉墊保持粉紅色
        pawBaseColor: '#404040',
        maxPrintLifeTime: 2500
    });
});