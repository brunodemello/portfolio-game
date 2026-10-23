# portfolio-game

A carreira de Bruno de Mello como um jogo 2D: um side-scroller em que andar é avançar no
tempo, de 2013 até hoje. O cenário, o horário do dia e o visual do personagem mudam a cada
capítulo, os telões contam cada experiência e as skills vão sendo coletadas pelo caminho.

- v2: https://brunodemello.dev/portfolio-game-v2/ (versão estável)
- v3: https://brunodemello.dev/portfolio-game-v3/ (em evolução: transições entre capítulos e level-up)

Português na raiz de cada versão e inglês em `en/`.

## Estrutura

```
v2/, v3/          uma pasta por versão, independentes
  index.html      conteúdo em português (fonte única: o jogo lê os <article class="station">)
  en/index.html   conteúdo em inglês
  style.css
  js/             motor (ES modules, sem dependências)
  art/web/        arte em WebP + assets.json (tamanhos e retângulos em unidades do mundo)
scripts/build.py  gera dist/portfolio-game-<versão> com cache busting
```

### Módulos (`js/`)

- `main.js`: loop, física, câmera, renderização, seguidores, level-up, progresso salvo.
- `world.js`: unidades do mundo, capítulos, ciclo do dia, ano por posição.
- `scenery.js`: céu, fundos com parallax, chão, objetos, prédios e detalhes vivos.
- `raster.js`: `Painter`, desenho em unidades do mundo alinhado à grade de pixels.
- `art.js`: carregamento das artes por capítulo.
- `hud.js`: telões, linha do tempo, coleta e roda de skills, conquistas, painéis.
- `input.js`: teclado, roda do mouse, arrastar no toque e botões na tela.
- `i18n.js`: textos da interface (pt/en).
- `music.js`, `audio.js`, `fx.js`, `character.js`: trilha, efeitos, partículas, sprite de reserva.

## Rodar localmente

```sh
python3 scripts/build.py
python3 -m http.server 8315 --directory dist
# http://127.0.0.1:8315/portfolio-game-v3/
```

O jogo é servido dentro do site brunodemello.dev e usa alguns arquivos dele por caminho
absoluto (fontes Manrope e favicon em `/assets/`, capturas do CareerOS e do ClearDesk, currículo
em `/pt/resume/` e `/en/resume/`, PDFs em `/downloads/`). Fora do site, essas partes caem
para os padrões do navegador ou ficam sem link.

## Arte

Cenários, objetos e personagens foram gerados por IA (Codex/ImageGen) a partir de briefs
de estilo e, no caso do Bruno, de fotos dele. Os originais em alta resolução e os prompts não
fazem parte do repositório; aqui ficam só as versões WebP usadas pelo jogo.
