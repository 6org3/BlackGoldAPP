# Reglas de Desarrollo (Workspace)

## Prevención de Errores en React (App.jsx)
- **Verificación de Sintaxis Obligatoria**: SIEMPRE que se realice una modificación estructural mediante reemplazos en archivos React complejos (como `App.jsx`, `Sidebar.jsx`, etc.), especialmente aquellos que contienen JSX con múltiples niveles de indentación (`<div>` anidados), debes **OBLIGATORIAMENTE** ejecutar `cmd.exe /c npm run build` (o un linter) inmediatamente después del cambio y *antes* de responder al usuario.
- Esto es para evitar los bloqueos de servidor por errores tipográficos o falta de etiquetas de cierre (ej. `</div>`) que han sucedido en el pasado al usar la herramienta `multi_replace_file_content`.
