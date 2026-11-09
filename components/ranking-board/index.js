Component({
  properties: {
    items: { type: Array, value: [] },
    selectedItems: { type: Array, value: [] },
    completed: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    canGoBack: { type: Boolean, value: false },
    canGoForward: { type: Boolean, value: false },
    error: { type: String, value: '' },
    helper: { type: String, value: '按第一反应依次点选，排出你的处理顺序' }
  },
  methods: {
    choose(event) {
      if (this.data.disabled || this.data.completed) return;
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isInteger(index) || !this.data.items[index]) return;
      this.triggerEvent('change', { index });
    },
    undo() {
      if (this.data.disabled || !this.data.selectedItems.length) return;
      this.triggerEvent('undo');
    },
    reset() {
      if (this.data.disabled || !this.data.selectedItems.length) return;
      this.triggerEvent('reset');
    },
    back() {
      if (this.data.disabled || !this.data.canGoBack) return;
      this.triggerEvent('back');
    },
    forward() {
      if (this.data.disabled || !this.data.canGoForward) return;
      this.triggerEvent('forward');
    },
    retry() {
      if (this.data.disabled || !this.data.error) return;
      this.triggerEvent('retry');
    }
  }
});
