' KOZON Detail Page Maker - hidden auto-restart launcher v2
' Fixed 2026-06-09: wmic replaced with PowerShell Get-CimInstance for Win11 24H2+
'                   Korean inline string literal removed (was causing encoding error)

Option Explicit

Const TARGET_PORT = "7777"

Dim fso, wsh, scriptDir, serverJs
Set fso = CreateObject("Scripting.FileSystemObject")
Set wsh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverJs = scriptDir & "\server.js"

Dim logPath
logPath = fso.GetParentFolderName(scriptDir) & "\server_launcher_error.log"

If Not fso.FileExists(serverJs) Then
    Call WriteLog(logPath, "ERROR: server.js not found at " & serverJs)
    WScript.Quit 1
End If

Dim exec, line, parts, i, pid, found, expectedServerPath
found = False
expectedServerPath = serverJs

Set exec = wsh.Exec("cmd /c netstat -ano | findstr LISTENING")
Do While Not exec.StdOut.AtEndOfStream
    line = exec.StdOut.ReadLine()
    If InStr(line, ":" & TARGET_PORT & " ") > 0 Or InStr(line, ":" & TARGET_PORT & Chr(9)) > 0 Then
        parts = Split(Trim(line))
        For i = UBound(parts) To 0 Step -1
            If Len(parts(i)) > 0 Then
                pid = parts(i)
                Exit For
            End If
        Next
        If IsNumeric(pid) And CLng(pid) > 0 Then
            Dim psCmd, psExec, cmdLine, isOurServer
            isOurServer = False
            psCmd = "powershell -NoProfile -NonInteractive -Command " & Chr(34) & "(Get-CimInstance Win32_Process -Filter 'ProcessId=" & pid & "').CommandLine" & Chr(34)
            Set psExec = wsh.Exec(psCmd)
            Do While Not psExec.StdOut.AtEndOfStream
                cmdLine = psExec.StdOut.ReadLine()
                If InStr(cmdLine, expectedServerPath) > 0 Then
                    isOurServer = True
                    Exit Do
                End If
            Loop
            If isOurServer Then
                wsh.Run "cmd /c taskkill /F /T /PID " & pid, 0, True
                found = True
            End If
        End If
    End If
Loop

If found Then
    WScript.Sleep 2000
End If

wsh.CurrentDirectory = scriptDir
wsh.Run "node " & Chr(34) & serverJs & Chr(34), 0, False

Sub WriteLog(logFile, msg)
    On Error Resume Next
    Dim stream, f
    Set stream = CreateObject("Scripting.FileSystemObject")
    Set f = stream.OpenTextFile(logFile, 8, True)
    f.WriteLine "[" & Now() & "] " & msg
    f.Close
End Sub
