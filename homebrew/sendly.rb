# Homebrew formula for Sendly CLI
# To install: brew install sendly-live/tap/sendly

class Sendly < Formula
  desc "CLI for Sendly SMS API - Send SMS from your terminal"
  homepage "https://sendly.live"
  url "https://registry.npmjs.org/@sendly/cli/-/cli-3.3.1.tgz"
  sha256 "070820087966dc60d74a098cfd2798bb72056dd6b92c586a012ca0b34d0204c4"
  license "MIT"

  depends_on "node" # Requires Node.js >= 18.0.0

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "sendly", shell_output("#{bin}/sendly --version")
  end
end
