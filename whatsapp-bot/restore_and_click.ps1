# restore_and_click.ps1
try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    
    # Definisikan fungsi Windows API tingkat lanjut secara global
    $memberDefinition = @'
    using System;
    using System.Runtime.InteropServices;
    using System.Text;

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public class Win32WindowHelper {
        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        [DllImport("user32.dll")]
        public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        
        // Fungsi tambahan untuk simulasi klik mouse fisik
        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")]
        public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
    }
'@
    Add-Type -TypeDefinition $memberDefinition -ErrorAction SilentlyContinue
    
    $proc = Get-Process Downloader -ErrorAction SilentlyContinue
    if (-not $proc) {
        Start-Process "C:\Program Files (x86)\Fingerspot Personnel\Downloader.exe"
        Start-Sleep -Seconds 5
        $proc = Get-Process Downloader -ErrorAction SilentlyContinue
    }
    
    if ($proc) {
        $downloaderPid = $proc.Id
        
        # List untuk menampung semua handle milik process ini
        $handles = New-Object System.Collections.Generic.List[IntPtr]
        
        $enumProc = [EnumWindowsProc] {
            param($hwnd, $lparam)
            $windowPid = 0
            [Win32WindowHelper]::GetWindowThreadProcessId($hwnd, [ref]$windowPid)
            if ($windowPid -eq $downloaderPid) {
                $handles.Add($hwnd)
            }
            return $true
        }
        
        [Win32WindowHelper]::EnumWindows($enumProc, [IntPtr]::Zero)
        
        $targetHandle = [IntPtr]::Zero
        foreach ($hwnd in $handles) {
            $sb = New-Object System.Text.StringBuilder 256
            [Win32WindowHelper]::GetWindowText($hwnd, $sb, 256)
            $title = $sb.ToString()
            if ($title -like "*PERSONNEL DOWNLOADER*") {
                $targetHandle = $hwnd
                break
            }
        }
        
        if ($targetHandle -eq [IntPtr]::Zero -and $handles.Count -gt 0) {
            $targetHandle = $handles[0]
        }
        
        if ($targetHandle -ne [IntPtr]::Zero) {
            [Win32WindowHelper]::ShowWindowAsync($targetHandle, 9) # 9 = SW_RESTORE
            Start-Sleep -Seconds 1
            [Win32WindowHelper]::ShowWindowAsync($targetHandle, 5) # 5 = SW_SHOW
            Start-Sleep -Seconds 1
            [Win32WindowHelper]::SetForegroundWindow($targetHandle)
            Start-Sleep -Seconds 1
            
            $windowElement = [System.Windows.Automation.AutomationElement]::FromHandle($targetHandle)
            if ($windowElement) {
                $condition = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty,
                    "Download"
                )
                $button = $windowElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
                if ($button) {
                    $rect = $button.Current.BoundingRectangle
                    $x = [int]($rect.Left + ($rect.Width / 2))
                    $y = [int]($rect.Top + ($rect.Height / 2))
                    
                    # Gerakkan mouse ke tombol dan klik
                    [Win32WindowHelper]::SetCursorPos($x, $y)
                    Start-Sleep -Milliseconds 100
                    [Win32WindowHelper]::mouse_event(0x02, 0, 0, 0, 0) # MOUSEEVENTF_LEFTDOWN
                    Start-Sleep -Milliseconds 100
                    [Win32WindowHelper]::mouse_event(0x04, 0, 0, 0, 0) # MOUSEEVENTF_LEFTUP
                    Write-Output "SUCCESS"
                    
                    # Tunggu 25 detik agar proses penarikan data selesai sepenuhnya
                    Start-Sleep -Seconds 25
                    # Tutup Downloader agar bersih dan melepaskan resource
                    Stop-Process -Name Downloader -Force -ErrorAction SilentlyContinue
                }
                else {
                    Write-Output "BUTTON_NOT_FOUND"
                }
            }
            else {
                Write-Output "WINDOW_ELEMENT_FAILED"
            }
        }
        else {
            Write-Output "HANDLE_NOT_FOUND"
        }
    }
}
catch {
    Write-Output "ERROR: $_"
}
