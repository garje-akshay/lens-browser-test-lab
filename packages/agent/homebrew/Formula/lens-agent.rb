class LensAgent < Formula
  desc "Lens agent — run the device backend + ws-scrcpy + tunnel on your Mac"
  homepage "https://github.com/garje-akshay/lens"
  version "0.1.9"
  license "MIT"

  # android-platform-tools is a cask, not a formula, so it can't be declared
  # as depends_on here. `lens-agent doctor` checks for adb at runtime and
  # prints the cask-install hint if it's missing.
  #
  # ws-scrcpy 0.8.1 bundles node-pty 0.10.1 which fails to compile on Node 22+
  # (V8 API changes), so we pin the runtime to node@20. The agent prepends
  # /opt/homebrew/opt/node@20/bin to PATH when spawning children.
  depends_on "cloudflared"
  depends_on "node@20"

  def caveats
    <<~EOS
      lens-agent also needs `adb` from the android-platform-tools cask:
        brew install --cask android-platform-tools
      Run `lens-agent doctor` to verify all prerequisites.
    EOS
  end

  on_macos do
    on_arm do
      url "https://github.com/garje-akshay/homebrew-lens/releases/download/v#{version}/lens-agent-arm64"
      sha256 "2411a68565f0de2d2798179b52e15943698604243652a91f933720ad36e893ef"
    end
    on_intel do
      url "https://github.com/garje-akshay/homebrew-lens/releases/download/v#{version}/lens-agent-x64"
      sha256 "2b6e8223098c7f8ba0a2a2c3907ffb0033eb855376a35e8efbfb608b2c3514f6"
    end
  end

  def install
    bin.install Dir["*"].first => "lens-agent"
  end

  test do
    assert_match "lens-agent", shell_output("#{bin}/lens-agent --version")
    assert_match "All prerequisites installed.", shell_output("#{bin}/lens-agent doctor")
  end
end
