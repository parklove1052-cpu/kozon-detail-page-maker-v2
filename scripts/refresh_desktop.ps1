$signature = @"
[DllImport("shell32.dll")]
public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
"@
$t = Add-Type -MemberDefinition $signature -Name W -Namespace S -PassThru
$t::SHChangeNotify(0x8000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host 'desktop refresh signal sent'
