#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------- CLI args ---------
const args = process.argv.slice(2);
const opts = {
    projectPath: ".",
    port: "18081",
    entry: "index.html",
};
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--path" || a === "-p") && args[i + 1]) opts.projectPath = args[++i];
    else if ((a === "--port" || a === "-P") && args[i + 1]) opts.port = String(args[++i]);
    else if ((a === "--entry" || a === "-e") && args[i + 1]) opts.entry = args[++i];
}

const root = path.resolve(process.cwd(), opts.projectPath);
const WWW = path.join(root, "www");
const INDEX_HTML = path.join(WWW, "index.html");
const LAUNCHER_HTML = path.join(WWW, "launcher.html");
const CONFIG_XML = path.join(root, "config.xml");
const RES_XML_DIR = path.join(root, "res", "xml");
const NETSEC_XML = path.join(RES_XML_DIR, "network_security_config.xml");
const RESOURCES = path.join(root, "resources");

function die(msg) { console.error("✖ " + msg); process.exit(1); }
function ok(msg) { console.log("✔ " + msg); }
function info(msg) { console.log("→ " + msg); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function exists(p) { return fs.existsSync(p); }
function read(p) { return exists(p) ? fs.readFileSync(p, "utf8") : ""; }
function write(p, t) { ensureDir(path.dirname(p)); fs.writeFileSync(p, t, "utf8"); }

function addOnce(text, needle, insert) {
    return text.includes(needle) ? text : text + "\n" + insert;
}

function injectCSPInIndex() {
    if (!exists(INDEX_HTML)) die(`Missing ${path.relative(root, INDEX_HTML)}. Make sure you ran 'cordova create'.`);
    let html = read(INDEX_HTML);
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob: filesystem: gap: http://localhost:* http://127.0.0.1:* https://* 'unsafe-inline' 'unsafe-eval';">`;
    if (!/Content-Security-Policy/i.test(html)) {
        if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/(<head[^>]*>)/i, `$1\n  ${csp}`);
        } else {
            html = `<!doctype html>\n<html>\n<head>\n  ${csp}\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
        }
        write(INDEX_HTML, html);
        ok("Injected CSP meta into www/index.html");
    } else {
        ok("CSP meta already present in www/index.html");
    }
}

function createLauncher() {
    const tpl = fs.readFileSync(path.join(__dirname, "templates", "launcher.html"), "utf8");
    // inject defaults via window vars for easy override
    const injected = tpl.replace(
        "</head>",
        `  <script>window.LAUNCHER_PORT=${JSON.stringify(parseInt(opts.port, 10))};window.LAUNCHER_ENTRY=${JSON.stringify(opts.entry)};</script>\n</head>`
    );
    write(LAUNCHER_HTML, injected);
    ok("Created/updated www/launcher.html");
}

function installPlugins() {
    const cmd = (p) => {
        try {
            execSync(p, { cwd: root, stdio: "ignore" });
            ok(`Installed ${p.split(" ").slice(-1)[0]}`);
        } catch (e) {
            // If already installed, ignore
            info(`Skipping (maybe installed): ${p}`);
        }
    };
    // Prefer local cordova in PATH; fallback to npx cordova
    const cordovaCmd = "cordova";
    const runner = (p) => `${cordovaCmd} plugin add ${p}`;
    try {
        execSync(`${cordovaCmd} -v`, { stdio: "ignore" });
    } catch {
        // fallback
        info("cordova not in PATH, using npx cordova");
    }
    const run = (pkg) => {
        try { execSync(`${cordovaCmd} -v`, { stdio: "ignore" }); cmd(`${cordovaCmd} plugin add ${pkg}`); }
        catch { cmd(`npx cordova plugin add ${pkg}`); }
    };

    run("com-darryncampbell-cordova-plugin-intent");
    run("cordova-plugin-httpd");
    run("cordova-plugin-inappbrowser");
}

function createNetworkSecurityConfig() {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">127.0.0.1</domain>
    <domain includeSubdomains="true">localhost</domain>
  </domain-config>
</network-security-config>
`;
    ensureDir(RES_XML_DIR);
    write(NETSEC_XML, xml);
    ok("Created/updated res/xml/network_security_config.xml");
}

function writeConfigXmlFull() {
    if (!exists(root)) die("Project root not found.");
    const xml = `<?xml version='1.0' encoding='utf-8'?>
<widget id="com.arise.vr" version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
    <name>APPLICATION NAME</name>
    <description>AR/VR tour app</description>
    <author email="dev@cordova.apache.org" href="https://cordova.apache.org">Apache Cordova Team</author>
    <content src="launcher.html" />
    <allow-navigation href="*" />
    <allow-navigation href="http://localhost:*" />
    <allow-navigation href="http://127.0.0.1:*" />
    <access origin="*" />
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />
    <preference name="Orientation" value="landscape" />
    <preference name="Fullscreen" value="true" />
    <preference name="AndroidInsecureFileModeEnabled" value="true" />
    <preference name="AllowInlineMediaPlayback" value="true" />
    <preference name="DisallowOverscroll" value="true" />
    <platform name="android">
        <edit-config file="app/src/main/AndroidManifest.xml" mode="merge" target="/manifest/application">
            <application android:networkSecurityConfig="@xml/network_security_config" android:usesCleartextTraffic="true" xmlns:android="http://schemas.android.com/apk/res/android" />
        </edit-config>
        <resource-file src="res/xml/network_security_config.xml" target="app/src/main/res/xml/network_security_config.xml" />
        <icon background="resources/android/icon-background.png" foreground="resources/android/icon-foreground.png" />
        <icon src="resources/icon.png" />
        <preference name="AndroidWindowSplashScreenBackground" value="#000000" />
        <preference name="AndroidWindowSplashScreenAnimatedIcon" value="resources/android/splash-icon.png" />
        <preference name="SplashMaintainAspectRatio" value="true" />
        <preference name="ShowSplashScreen" value="true" />
        <preference name="AutoHideSplashScreen" value="false" />
        <preference name="FadeSplashScreenDuration" value="0" />
    </platform>
</widget>
`;
    write(CONFIG_XML, xml);
    ok("Wrote full config.xml (replaced any existing one)");
}


function createResourcePlaceholders() {
    ensureDir(RESOURCES);
    ensureDir(path.join(RESOURCES, "android"));

    // 1x1 transparent PNG
    const pngBlankBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
    const png = Buffer.from(pngBlankBase64, "base64");
    fs.writeFileSync(path.join(RESOURCES, "icon.png"), png);
    fs.writeFileSync(path.join(RESOURCES, "splash.png"), png);
    fs.writeFileSync(path.join(RESOURCES, "android", "icon-foreground.png"), png);
    fs.writeFileSync(path.join(RESOURCES, "android", "icon-background.png"), png);
    fs.writeFileSync(path.join(RESOURCES, "android", "splash-icon.png"), png);
    ok("Created resources/ placeholders (icon/splash)");
}

function sanity() {
    if (!exists(root)) die(`Project path not found: ${root}`);
    if (!exists(WWW)) die(`Missing www folder at: ${path.relative(process.cwd(), WWW)}`);
}

(function main() {
    console.log(`\ncordova-arise-setup\nProject: ${root}\nPort: ${opts.port}\nEntry: ${opts.entry}\n`);
    sanity();
    injectCSPInIndex();
    createLauncher();
    installPlugins();
    createNetworkSecurityConfig();
    writeConfigXmlFull();
    createResourcePlaceholders();

    console.log("\n✅ Done.");
    console.log("Next steps:");
    console.log("  1) Put your WebVR build under www/web/ and ensure your entry exists:");
    console.log(`     www/web/${opts.entry}`);
    console.log("  2) Use launcher.html as your start page (or keep index.html and link to it).");
    console.log("  3) Build:");
    console.log("     cordova platform add android");
    console.log("     cordova build android\n");
})();
