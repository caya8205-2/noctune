; Noctune NSIS installer hooks.
; The backend sidecar (noctune-backend.exe) is a windowless console process, so
; NSIS's default app-close logic (WM_CLOSE to the main window) never reaches it.
; Force-kill it before files are replaced/removed so installs and uninstalls do
; not fail on a locked binary or leave an orphaned process holding port 3131.

!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM noctune-backend.exe'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM noctune-backend.exe'
!macroend
