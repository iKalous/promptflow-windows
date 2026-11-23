using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class PromptFlowLauncher
{
    private static Process serverProcess;
    private static Process browserProcess;

    [STAThread]
    private static int Main()
    {
        try
        {
            string root = FindAppRoot();
            string node = FindNode();
            if (node == null)
            {
                MessageBox.Show(
                    "Node.js was not found. Install Node.js, then start PromptFlow again.",
                    "PromptFlow",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
            string browser = FindBrowser();
            if (browser == null)
            {
                MessageBox.Show(
                    "Microsoft Edge or Google Chrome was not found.",
                    "PromptFlow",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            int port = FreePort(47340);
            int cdp = FreePort(9340);
            string url = "http://127.0.0.1:" + port + "/";
            serverProcess = StartServer(node, root, port);
            if (!WaitReady(port, 20000))
            {
                Cleanup();
                MessageBox.Show(
                    "PromptFlow did not start. See dist\\server.log.",
                    "PromptFlow",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            string profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PromptFlow",
                "profile-" + Process.GetCurrentProcess().Id);
            Directory.CreateDirectory(profile);
            browserProcess = StartBrowser(browser, url, cdp, profile);
            if (!WaitPort(cdp, 20000))
            {
                Cleanup();
                MessageBox.Show(
                    "The PromptFlow window did not open.",
                    "PromptFlow",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
            WriteReady(root, url, cdp);
            while (PortOpen(cdp) && serverProcess != null && !serverProcess.HasExited)
            {
                Thread.Sleep(400);
            }
            Cleanup();
            return 0;
        }
        catch (Exception error)
        {
            Cleanup();
            try
            {
                MessageBox.Show(error.Message, "PromptFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch
            {
            }
            return 1;
        }
    }

    private static string FindAppRoot()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        DirectoryInfo parent = Directory.GetParent(baseDir);
        if (parent != null && File.Exists(Path.Combine(parent.FullName, "server.mjs")))
        {
            return parent.FullName;
        }
        if (File.Exists(Path.Combine(baseDir, "server.mjs")))
        {
            return baseDir;
        }
        throw new InvalidOperationException("server.mjs was not found next to PromptFlow.exe.");
    }

    private static string FindNode()
    {
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates = new string[]
        {
            Path.Combine(programFiles, "nodejs", "node.exe"),
            Path.Combine(local, "Programs", "nodejs", "node.exe")
        };
        for (int i = 0; i < candidates.Length; i++)
        {
            if (File.Exists(candidates[i])) return candidates[i];
        }
        return Which("node.exe");
    }

    private static string FindBrowser()
    {
        string[] candidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe")
        };
        for (int i = 0; i < candidates.Length; i++)
        {
            if (File.Exists(candidates[i])) return candidates[i];
        }
        return null;
    }

    private static string Which(string fileName)
    {
        ProcessStartInfo info = new ProcessStartInfo("where.exe", fileName);
        info.UseShellExecute = false;
        info.RedirectStandardOutput = true;
        info.CreateNoWindow = true;
        Process process = Process.Start(info);
        string line = process.StandardOutput.ReadLine();
        process.WaitForExit();
        if (process.ExitCode == 0 && !string.IsNullOrEmpty(line) && File.Exists(line.Trim()))
        {
            return line.Trim();
        }
        return null;
    }

    private static int FreePort(int start)
    {
        for (int port = start; port < start + 30; port++)
        {
            TcpListener listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                return port;
            }
            catch (SocketException)
            {
            }
            finally
            {
                if (listener != null) listener.Stop();
            }
        }
        throw new InvalidOperationException("No free local port from " + start + ".");
    }

    private static Process StartServer(string node, string root, int port)
    {
        string logPath = Path.Combine(root, "dist", "server.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath));
        File.WriteAllText(logPath, "");
        ProcessStartInfo info = new ProcessStartInfo(node, "server.mjs");
        info.WorkingDirectory = root;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        info.EnvironmentVariables["PORT"] = port.ToString();
        Process process = Process.Start(info);
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
        {
            if (args.Data != null) File.AppendAllText(logPath, args.Data + Environment.NewLine);
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
        {
            if (args.Data != null) File.AppendAllText(logPath, args.Data + Environment.NewLine);
        };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static bool WaitPort(int port, int timeoutMs)
    {
        int deadline = Environment.TickCount + timeoutMs;
        while (unchecked(deadline - Environment.TickCount) > 0)
        {
            if (PortOpen(port)) return true;
            Thread.Sleep(200);
        }
        return false;
    }

    private static bool PortOpen(int port)
    {
        TcpClient client = new TcpClient();
        try
        {
            IAsyncResult result = client.BeginConnect("127.0.0.1", port, null, null);
            bool connected = result.AsyncWaitHandle.WaitOne(300);
            if (!connected) return false;
            client.EndConnect(result);
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            client.Close();
        }
    }

    private static bool WaitReady(int port, int timeoutMs)
    {
        int deadline = Environment.TickCount + timeoutMs;
        while (unchecked(deadline - Environment.TickCount) > 0)
        {
            if (serverProcess != null && serverProcess.HasExited) return false;
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/");
                request.Timeout = 1000;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    if ((int)response.StatusCode == 200) return true;
                }
            }
            catch
            {
            }
            Thread.Sleep(200);
        }
        return false;
    }

    private static Process StartBrowser(string browser, string url, int cdp, string profile)
    {
        string arguments = string.Format(
            "--app={0} --window-size=1280,800 --remote-debugging-port={1} --user-data-dir=\"{2}\" --no-first-run --disable-extensions --disable-sync",
            url,
            cdp,
            profile);
        ProcessStartInfo info = new ProcessStartInfo(browser, arguments);
        info.UseShellExecute = false;
        return Process.Start(info);
    }

    private static void WriteReady(string root, string url, int cdp)
    {
        string path = Path.Combine(root, "dist", "running.json");
        string json = string.Format(
            "{{\"url\":\"{0}\",\"cdp\":{1},\"pid\":{2}}}",
            url,
            cdp,
            Process.GetCurrentProcess().Id);
        File.WriteAllText(path, json, new UTF8Encoding(false));
    }

    private static void Cleanup()
    {
        try
        {
            string root = FindAppRoot();
            string ready = Path.Combine(root, "dist", "running.json");
            if (File.Exists(ready)) File.Delete(ready);
        }
        catch
        {
        }
        Kill(browserProcess);
        Kill(serverProcess);
    }

    private static void Kill(Process process)
    {
        try
        {
            if (process != null && !process.HasExited) process.Kill();
        }
        catch
        {
        }
    }
}
