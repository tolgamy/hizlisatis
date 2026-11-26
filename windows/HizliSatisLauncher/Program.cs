using System.Diagnostics;
using System.Windows.Forms;

internal static class Program
{
    private const string Origin = "https://kolaykasam.com/";
    [STAThread]
    private static int Main(string[] args)
    {
        if (args is ["--self-test"])
            return OperatingSystem.IsWindows() && Uri.TryCreate(Origin, UriKind.Absolute, out var origin)
                && origin.Scheme == Uri.UriSchemeHttps ? 0 : 1;
        try
        {
            var roots = new[] {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            };
            foreach (var browser in new[] { @"Microsoft\Edge\Application\msedge.exe", @"Google\Chrome\Application\chrome.exe" })
                foreach (var root in roots)
                {
                    if (string.IsNullOrEmpty(root)) continue;
                    var path = Path.Combine(root, browser);
                    if (!File.Exists(path)) continue;
                    var info = new ProcessStartInfo(path) { UseShellExecute = false };
                    info.ArgumentList.Add("--app=" + Origin);
                    Process.Start(info);
                    return 0;
                }
            Process.Start(new ProcessStartInfo(Origin) { UseShellExecute = true });
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show("HızlıSatış açılamadı. Edge veya Chrome ile kolaykasam.com adresini açın.\n" + ex.Message,
                "HızlıSatış", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }
}
