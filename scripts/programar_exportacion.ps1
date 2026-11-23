# Programa la exportación automática del registro en el Programador de tareas de Windows.
# Corre scripts/exportar_registro.mjs una vez al día a las 10:00 mientras la sesión de Windows esté iniciada, aunque el equipo esté suspendido.
# Uso (PowerShell, en la carpeta del proyecto):   .\scripts\programar_exportacion.ps1
# Para quitarla:                                   Unregister-ScheduledTask -TaskName "HVCP Motor - Exportar registro" -Confirm:$false
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
if (-not (Test-Path (Join-Path $raiz ".env.exportacion"))) { throw "Falta .env.exportacion (copie .env.exportacion.ejemplo y llénelo)." }

$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$raiz\scripts\exportar_registro.mjs`"" -WorkingDirectory $raiz
$disparo = New-ScheduledTaskTrigger -Daily -At "10:00"
# -WakeToRun: despierta el equipo de la suspensión para exportar (requiere temporizadores de reactivación habilitados en el plan de energía).
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "HVCP Motor - Exportar registro" -Action $accion -Trigger $disparo -Settings $ajustes `
  -Description "Exporta el registro del Motor Clínico HVCP a Excel en OneDrive cada día a las 10:00." -Force | Out-Null
Write-Host "Listo: la exportación corre cada día a las 10:00. Revise exportacion.log en la carpeta de destino."
