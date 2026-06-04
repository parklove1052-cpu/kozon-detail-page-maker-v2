' KOZON Detail Page Maker - hidden auto-restart launcher
' Behavior:
'   1) Find PID listening on port 7777 (if any)
'   2) Kill it forcefully (taskkill /F /T)
'   3) Wait briefly, then launch fresh node server.js hidden
' This ensures latest code is always running. Safe under any encoding.

Option Explicit

Const TARGET_PORT = "7777"

Dim fso, wsh, scriptDir, serverJs
Set fso = CreateObject("Scripting.FileSystemObject")
Set wsh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverJs = scriptDir & "\server.js"

If Not fso.FileExists(serverJs) Then
    WScript.Echo "ERROR: server.js not found at " & serverJs
    WScript.Quit 1
End If

' --- 1) Find PID owning TCP port 7777 (LISTENING state) ---
Dim exec, line, parts, i, pid, found, expectedServerPath
found = False
' 우리 server.js의 절대경로 — PID 검증용 (다른 도메인 서버 오종료 방지, Codex 진단 4-1)
expectedServerPath = scriptDir & "\server.js"

Set exec = wsh.Exec("cmd /c netstat -ano | findstr LISTENING")
Do While Not exec.StdOut.AtEndOfStream
    line = exec.StdOut.ReadLine()
    If InStr(line, ":" & TARGET_PORT & " ") > 0 Or InStr(line, ":" & TARGET_PORT & vbTab) > 0 Then
        ' Parse last whitespace-separated token (PID)
        parts = Split(Trim(line))
        For i = UBound(parts) To 0 Step -1
            If Len(parts(i)) > 0 Then
                pid = parts(i)
                Exit For
            End If
        Next
        If IsNumeric(pid) And CLng(pid) > 0 Then
            ' --- 1-b) PID의 CommandLine을 확인 — 우리 server.js 경로 포함 시에만 종료 ---
            Dim cmdExec, cmdLine, isOurServer
            isOurServer = False
            Set cmdExec = wsh.Exec("cmd /c wmic process where ProcessId=" & pid & " get CommandLine /value 2>nul")
            Do While Not cmdExec.StdOut.AtEndOfStream
                cmdLine = cmdExec.StdOut.ReadLine()
                If InStr(cmdLine, expectedServerPath) > 0 Or InStr(LCase(cmdLine), LCase("상세페이지 제작자")) > 0 Then
                    isOurServer = True
                    Exit Do
                End If
            Loop
            If isOurServer Then
                ' --- 2) Kill OLD instance only (verified ours) ---
                wsh.Run "cmd /c taskkill /F /T /PID " & pid, 0, True
                found = True
            End If
            ' isOurServer가 False이면 — 다른 노드 프로세스가 7777 점유 중. 종료하지 않음.
            ' (이 경우 새 server.js 부팅이 EADDRINUSE로 즉시 실패하지만, 다른 도메인 보호가 우선)
        End If
    End If
Loop

If found Then
    ' Wait for TIME_WAIT / socket release
    WScript.Sleep 2000
End If

' --- 3) Launch fresh server hidden ---
wsh.CurrentDirectory = scriptDir
' 0 = hidden window, False = do not wait
wsh.Run "node """ & serverJs & """", 0, False
