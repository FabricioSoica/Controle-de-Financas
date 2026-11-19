// Categorical palette validated (CVD and contrast) against the dark app surface; order matters for adjacent stacks
const CATEGORICAL_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];

export const OTHER_SERIES_COLOR = '#6b7280';

export const getSeriesColor = (index) => CATEGORICAL_COLORS[index] || OTHER_SERIES_COLOR;
