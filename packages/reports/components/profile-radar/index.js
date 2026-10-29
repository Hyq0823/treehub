Component({
  properties: {
    dimensions: { type: Array, value: [], observer: 'queueDraw' }
  },
  lifetimes: {
    ready() {
      this._ready = true;
      this.queueDraw();
    },
    detached() {
      this._ready = false;
      if (this._drawTimer) clearTimeout(this._drawTimer);
    }
  },
  methods: {
    queueDraw() {
      if (!this._ready) return;
      if (this._drawTimer) clearTimeout(this._drawTimer);
      this._drawTimer = setTimeout(() => this.draw(), 0);
    },
    draw() {
      const dimensions = (this.data.dimensions || []).slice(0, 9);
      if (dimensions.length < 3) return;
      this.createSelectorQuery().select('#profile-radar').fields({ node: true, size: true }).exec(result => {
        const field = result && result[0];
        if (!field || !field.node || !field.width || !field.height) return;
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
        const radius = Math.min(field.width, field.height) * 0.39;
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
        [1, 0.75, 0.5, 0.25].forEach(scale => polygon(scale, '', 'rgba(92, 119, 98, 0.28)', 1));
        dimensions.forEach((item, index) => {
          const outer = point(index, 1);
          context.beginPath();
          context.moveTo(centerX, centerY);
          context.lineTo(outer.x, outer.y);
          context.strokeStyle = 'rgba(92, 119, 98, 0.22)';
          context.lineWidth = 1;
          context.stroke();
        });
        const values = dimensions.map(item => Math.max(0.16, Math.min(1, Math.abs(Number(item.percent) - 50) / 50)));
        context.beginPath();
        values.forEach((value, index) => {
          const current = point(index, value);
          if (!index) context.moveTo(current.x, current.y); else context.lineTo(current.x, current.y);
        });
        context.closePath();
        const gradient = context.createLinearGradient(0, 0, field.width, field.height);
        gradient.addColorStop(0, 'rgba(80, 130, 95, 0.62)');
        gradient.addColorStop(1, 'rgba(210, 166, 75, 0.64)');
        context.fillStyle = gradient;
        context.fill();
        context.strokeStyle = '#b48a3d';
        context.lineWidth = 2;
        context.stroke();
        values.forEach((value, index) => {
          const current = point(index, value);
          context.beginPath();
          context.arc(current.x, current.y, 4, 0, Math.PI * 2);
          context.fillStyle = '#f8e5a8';
          context.fill();
          context.strokeStyle = '#8a6a31';
          context.lineWidth = 1.5;
          context.stroke();
        });
      });
    }
  }
});
