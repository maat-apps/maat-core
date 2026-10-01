// The ecosystem's typeface, Outfit, self-hosted — never fetched from Google
// Fonts at runtime. A true variable font, which arbitrary Tailwind weights
// like `font-semibold` rely on.
//
// Imported from the app's JS entry (`import "@maat-apps/ui/font"` in
// main.tsx), not from theme.css: Tailwind inlines a CSS @import without
// rebasing its relative `url()`s, so the font files never reached the app's
// build (maat-core#78). Imported from JS, Vite processes the font's CSS as
// its own module and emits the files.
import "@fontsource-variable/outfit";
