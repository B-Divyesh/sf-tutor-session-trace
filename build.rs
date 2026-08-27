use std::{env, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=BUILD_SHA");
    for path in ["HEAD", "refs/heads/main"] {
        if let Some(git_path) = git_output(&["rev-parse", "--git-path", path]) {
            println!("cargo:rerun-if-changed={git_path}");
        }
    }

    let sha = env::var("BUILD_SHA").unwrap_or_else(|_| {
        git_output(&["rev-parse", "HEAD"])
            .unwrap_or_else(|| "0000000000000000000000000000000000000000".to_owned())
    });

    assert!(
        sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "BUILD_SHA must be a full 40-character commit SHA"
    );
    println!("cargo:rustc-env=BUILD_SHA={sha}");
}

fn git_output(args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_owned())
}
