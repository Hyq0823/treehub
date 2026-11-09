Component({
  properties: {
    dimensions: { type: Array, value: [], observer: 'queueDraw' },
    mode: { type: String, value: 'clarity', observer: 'queueDraw' }
  },
  lifetimes: {
    ready() {
      this._ready = true;
      this._drawRequest = this._drawRequest || 0;
      this.queueDraw();
    },
    detached() {
      this._ready = false;
      this._drawRequest = (this._drawRequest || 0) + 1;
      if (this._drawTimer) clearTimeout(this._drawTimer);
      this._drawTimer = null;
      this._drawSignature = '';
    }
  },
  methods: {
    queueDraw() {
      if (!this._ready) return;
      const dimensions = (this.data.dimensions || []).slice(0, 9);
      const signature = `${this.data.mode || 'clarity'}:${JSON.stringify(dimensions.map(item => Number(item && item.percent)))}`;
      if (signature === this._drawSignature) return;
      if (this._drawTimer) clearTimeout(this._drawTimer);
      const request = this._drawRequest = (this._drawRequest || 0) + 1;
      this._drawSignature = signature;
      this._drawTimer = setTimeout(() => {
        this._drawTimer = null;
        this.draw(request, signature);
      }, 0);
    },
    draw(request, signature) {
      if (!this._ready || request !== this._drawRequest) return;
      const dimensions = (this.data.dimensions || []).slice(0, 9);
      if (dimensions.length < 3) {
        if (request === this._drawRequest) this._drawSignature = '';
        return;
      }
      this.createSelectorQuery().select('#profile-radar').fields({ node: true, size: true }).exec(result => {
        if (!this._ready || request !== this._drawRequest) return;
        const field = result && result[0];
        if (!field || !field.node || !field.width || !field.height) {
          if (request === this._drawRequest && this._drawSignature === signature) this._drawSignature = '';
          return;
        }
        const canvas = field.node;
        const context = canvas.getContext('2d');
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const ratio = info.pixelRatio || 1;
        canvas.width = field.width * ratio;
        canvas.height = field.height * ratio;
        context.scale(ratio, ratio);
        context.clearRect(0, 0, field.width, field.height);
        const centerX = field.width / 2;
        const centerY = field.height / 2;
        const radius = Math.min(field.width, field.height) * 0.43;
        const angle = index => -Math.PI / 2 + index * Math.PI * 2 / dimensions.length;
        const point = (index, scale) => ({
          x: centerX + Math.cos(angle(index)) * radius * scale,
          y: centerY + Math.sin(angle(index)) * radius * scale
        });
        const polygon = (scale, fill, stroke, lineWidth) => {
          context.beginPath();
          dimensions.forEach((item, index) => {
            const current = point(index, scale);
            if (!index) context.moveTo(current.x, current.y); else context.lineTo(current.x, current.y);
          });
          context.closePath();
          if (fill) { context.fillStyle = fill; context.fill(); }
          if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth || 1; context.stroke(); }
        };
        [1, 0.75, 0.5, 0.25].forEach(scale => polygon(scale, '', 'rgba(77, 128, 201, 0.24)', 1));
        dimensions.forEach((item, index) => {
          const outer = point(index, 1);
          context.beginPath();
          context.moveTo(centerX, centerY);
          context.lineTo(outer.x, outer.y);
          context.strokeStyle = 'rgba(77, 128, 201, 0.18)';
          context.lineWidth = 1;
          context.stroke();
        });
        // Keep balanced answers visible instead of collapsing the whole portrait
        // into the center. The chart still expands with preference clarity.
        const values = dimensions.map(item => {
          const percent = Math.max(0, Math.min(100, Number(item.percent) || 0));
          if (this.data.mode === 'priority') return 0.18 + percent / 100 * 0.82;
          const clarity = Math.min(1, Math.abs(percent - 50) / 50);
          return 0.46 + clarity * 0.54;
        });
        context.beginPath();
        values.forEach((value, index) => {
          const current = point(index, value);
          if (!index) context.moveTo(current.x, current.y); else context.lineTo(current.x, current.y);
        });
        context.closePath();
        const gradient = context.createLinearGradient(0, 0, field.width, field.height);
        gradient.addColorStop(0, 'rgba(92, 168, 255, 0.48)');
        gradient.addColorStop(1, 'rgba(142, 139, 241, 0.38)');
        context.fillStyle = gradient;
        context.fill();
        context.strokeStyle = '#467fff';
        context.lineWidth = 2;
        context.stroke();
        values.forEach((value, index) => {
          const current = point(index, value);
          context.beginPath();
          context.arc(current.x, current.y, 4, 0, Math.PI * 2);
          context.fillStyle = '#ffffff';
          context.fill();
          context.strokeStyle = '#467fff';
          context.lineWidth = 1.5;
          context.stroke();
        });
      });
    }
  }
});
