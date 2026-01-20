# Implementation Plan - Seal Effect Toggle Button

## Goal
Add a button to the "Audiovisual Settings" (视听设置) menu to allow users to toggle the "Seal Stamping Effect" (盖章特效) on desktop. This includes the "hammer" animation and the sound effects.

## Proposed Changes

### 1. HTML (`index.html`)
- Add a new button in `.music-wrapper` (inside the "Audiovisual Settings" expanded menu).
- Label: "印章<br>特效" (Seal Effect).
- ID: `seal-btn`.
- Onclick: `toggleSealEffect()`.

### 2. JavaScript (`js/script.js`)
- Implement `initSealEffect()`:
    - Check `localStorage.getItem('sealEffectEnabled')`. Default is 'true'.
    - Update `seal-btn` style (e.g., `active` class if enabled).
    - Call this on load.
- Implement `toggleSealEffect()`:
    - Toggle the state.
    - Save to `localStorage`.
    - Update button UI.
    - (Optional) Notify user (e.g. "Specials Effects On/Off").

### 3. JavaScript (`js/poem-animation.js`)
- Modify `playAssemblyAnimation()`:
    - Read `localStorage.getItem('sealEffectEnabled')`.
    - If 'false':
        - Skip the GSAP animation logic for `.stamps-container .seal` (or force them visible immediately).
        - Skip the `seal-preparing`/`seal-landing` class manipulation for the main seal.
        - Skip sound playback.
    - If 'true':
        - Proceed as normal.

## Verification Plan

### Manual Verification
1. Open http://localhost:8080.
2. Open "视听设置" menu.
3. Observe new "印章特效" button. Verify it indicates "On" (default).
4. Switch poem (Next/Prev). Verify "Seal Hammer" animation and sound play.
5. Click "印章特效" button to turn it OFF.
6. Switch poem. Verify:
    - Main seal appears statically (no hammer animation).
    - No impact sound.
    - Small stamps appear (either via CSS fade-in or statically).
7. Reload page. Verify setting persists (still OFF).
