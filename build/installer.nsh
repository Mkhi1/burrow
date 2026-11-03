; Adds "Open in Burrow" to the Explorer right-click menu (per user, no admin needed).
; Folders, the empty area inside a folder, and files. Removed again on uninstall.
; On Windows 11 these appear under "Show more options" (or Shift+F10).

!macro customInstall
  ; Right-click a folder
  WriteRegStr HKCU "Software\Classes\Directory\shell\Burrow" "" "Open in Burrow"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Burrow" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\Burrow\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  ; Right-click empty space inside a folder
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Burrow" "" "Open in Burrow"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Burrow" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Burrow\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  ; Right-click a file (opens its folder)
  WriteRegStr HKCU "Software\Classes\*\shell\Burrow" "" "Open in Burrow"
  WriteRegStr HKCU "Software\Classes\*\shell\Burrow" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\*\shell\Burrow\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Burrow"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Burrow"
  DeleteRegKey HKCU "Software\Classes\*\shell\Burrow"
!macroend
