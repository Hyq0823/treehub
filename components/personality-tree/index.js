const POSITIONS = {
  ginkgo: [0, 0], banyan: [1, 0], pine: [2, 0],
  maple: [0, 1], willow: [1, 1], olive: [2, 1]
};
Component({
  properties: {
    tree: { type: Object, value: null, observer: 'updateTree' },
    size: { type: String, value: 'medium' }
  },
  data: { stageId: 'seed', spriteStyle: '', shapeStyle: '', sparks: [] },
  methods: {
    updateTree(tree) {
      if (!tree) return;
      const position = POSITIONS[tree.speciesId] || POSITIONS.ginkgo;
      const stageId = tree.stage && tree.stage.id || 'seed';
      const variant = Number(tree.variant) || 0;
      const scales = { growing: 0.82, flourishing: 0.92, blossom: 1, starlight: 1 };
      const scale = scales[stageId] || 0.82;
      const tilt = (variant % 5) - 2;
      this.setData({
        stageId,
        spriteStyle: `left: -${position[0] * 100}%; top: -${position[1] * 100}%;`,
        shapeStyle: `transform: rotate(${tilt}deg) scale(${scale}) scaleX(${variant % 2 ? -1 : 1});`,
        sparks: [0, 1, 2].map(i => ({
          id: i, left: 15 + (Math.floor(variant / Math.pow(7, i)) % 65),
          top: 15 + (Math.floor(variant / Math.pow(11, i)) % 50)
        }))
      });
    }
  }
});
