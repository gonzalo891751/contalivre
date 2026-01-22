# CSS Foundation Notes

- .cl-shell: aplica el fondo de shell (gradiente) y min-height. Usar en el contenedor raiz para mantener el look actual.
- .cl-ui: opt-in para estilos legacy de UI (.btn, .card, .table, .modal, .layout, .sidebar). En pantallas nuevas, evitar si queres estilos solo Tailwind.
- .cl-prose: opt-in para tipografia (h1-h6, p, a). En pantallas nuevas, usar solo donde quieras esos defaults.
- CleanLayout: disponible en `/clean/*` para renderizar sin `.cl-ui` ni `.cl-prose`. Usar `withShell` si queres conservar el fondo del shell.
- Para prototipos Tailwind puros: no envolver con .cl-ui/.cl-prose y definir estilos con utilities o CSS Modules.
- Si mezclas: .cl-ui en el layout general y .cl-prose solo en secciones de texto.
