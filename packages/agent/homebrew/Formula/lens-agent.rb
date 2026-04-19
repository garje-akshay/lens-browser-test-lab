class LensAgent < Formula
  desc "Lens agent — run the device backend + ws-scrcpy + tunnel on your Mac"
  homepage "https://github.com/garje-akshay/lens"
  version "0.1.7"
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
      sha256 "c684ccae3d40df9f30081dfae23c762c3e7a441e5d1b7b5536d8ecf4626a5ec4"
    end
    on_intel do
      url "https://github.com/garje-akshay/homebrew-lens/releases/download/v#{version}/lens-agent-x64"
      sha256 "ac37ff83122d9c903637b8ef936cdaf1e89f87c7f2158f38e6b4cdea4f3ddbe8"
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
