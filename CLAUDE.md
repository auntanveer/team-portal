# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-file Tic Tac Toe game (`tictactoe.html`). No build system, no dependencies — open directly in a browser to run.

## Architecture

All code lives in one HTML file with three inline sections:

- **CSS** (`<style>`) — Dark-themed UI with a purple/blue gradient palette. Key classes: `.cell`, `.cell.winner`, `.mode-btn.active`, `.status.highlight`.
- **HTML** (`<body>`) — Static 3×3 grid of `.cell` divs with `data-i` attributes (0–8), mode toggle buttons, scoreboard, and a reset button.
- **JavaScript** (`<script>`) — All game logic at the bottom:
  - `board[]` — 9-element array, `null | 'X' | 'O'`
  - `WINS` — 8 hardcoded win-line index triples
  - `checkWinner(b)` — returns `{ winner, line }` or `null`
  - `minimax(b, isMax)` — unoptimized full-depth minimax; AI always plays as `'O'`
  - `makeMove(i)` — single entry point for both human and AI moves
  - `setMode(ai)` — switches between 2-player and vs-AI, resets board and scores

## Key Behaviors

- AI move fires after a 350ms `setTimeout` for UX feel.
- Scores persist across rounds within a mode session but reset on mode switch.
- `render()` rebuilds all cell classes from `board[]` on every move.
