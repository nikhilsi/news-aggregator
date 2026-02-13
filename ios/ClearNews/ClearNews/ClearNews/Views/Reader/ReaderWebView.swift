import SwiftUI
import WebKit

struct ReaderWebView: UIViewRepresentable {
    let html: String
    let fontScale: Double
    @Binding var contentHeight: CGFloat

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "heightChange")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let fullHTML = wrapHTML(html)
        webView.loadHTMLString(fullHTML, baseURL: nil)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    private func wrapHTML(_ content: String) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <style>
            :root {
                color-scheme: light dark;
            }
            body {
                font-family: -apple-system, system-ui, sans-serif;
                font-size: \(Int(17 * fontScale))px;
                line-height: 1.7;
                color: #1a1a1a;
                background: transparent;
                margin: 0;
                padding: 0;
                word-wrap: break-word;
                -webkit-text-size-adjust: 100%;
            }
            @media (prefers-color-scheme: dark) {
                body { color: #e5e5e5; }
                a { color: #60a5fa; }
            }
            img {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                margin: 16px 0;
            }
            a { color: #2563eb; text-decoration: none; }
            a:hover { text-decoration: underline; }
            h1, h2, h3, h4 {
                line-height: 1.3;
                margin-top: 24px;
                margin-bottom: 8px;
            }
            p { margin: 0 0 16px 0; }
            blockquote {
                border-left: 3px solid #d1d5db;
                margin: 16px 0;
                padding: 8px 16px;
                color: #6b7280;
            }
            @media (prefers-color-scheme: dark) {
                blockquote { border-left-color: #4b5563; color: #9ca3af; }
            }
            pre, code {
                font-size: 14px;
                background: #f3f4f6;
                border-radius: 4px;
            }
            @media (prefers-color-scheme: dark) {
                pre, code { background: #1f2937; }
            }
            code { padding: 2px 4px; }
            pre { padding: 12px; overflow-x: auto; }
            pre code { padding: 0; background: none; }
        </style>
        </head>
        <body>
        \(content)
        <script>
            function reportHeight() {
                window.webkit.messageHandlers.heightChange.postMessage(
                    document.body.scrollHeight
                );
            }
            window.addEventListener('load', function() {
                setTimeout(reportHeight, 100);
            });
            new ResizeObserver(reportHeight).observe(document.body);
        </script>
        </body>
        </html>
        """
    }

    // MARK: - Coordinator

    @MainActor
    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let parent: ReaderWebView

        init(_ parent: ReaderWebView) {
            self.parent = parent
            super.init()
        }

        // Open external links in Safari
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        // Receive content height from JavaScript
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            if let height = message.body as? CGFloat {
                parent.contentHeight = height
            }
        }
    }
}
