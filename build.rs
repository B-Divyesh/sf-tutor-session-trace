use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=BUILD_SHA");
    let sha = env::var("BUILD_SHA")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "dev".to_owned());

    assert!(
        sha == "dev" || (sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit())),
        "BUILD_SHA must be 'dev', empty, or a full 40-character commit SHA"
    );
    println!("cargo:rustc-env=BUILD_SHA={sha}");
}
