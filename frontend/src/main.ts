import { mount } from 'svelte';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/vt323/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './themes/base.css';
import './themes/retro.css';
import './themes/modern.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
