#!/usr/bin/env bash

# ==============================================================================
# Smackhem Audio Conversion Utilities
# ==============================================================================
# Converts .wav and .mp3 files into .ogg (Ogg Vorbis) using ffmpeg.
#
# Usage:
#   1. Source this file in your bash shell to load commands:
#        source scripts/audio-aliases.sh
#
#      Then inside any directory (e.g. public/assets/audio/):
#        wav2ogg              - Convert all .wav files in current dir (Untrimmed, for music/loops)
#        wav2ogg-trim         - Convert & strip dead air/silence (Ideal for SFX / UI)
#        mp32ogg              - Convert all .mp3 files in current dir (Untrimmed)
#        mp32ogg-trim         - Convert & strip dead air/silence (Ideal for SFX / UI)
#        audio2ogg            - Convert all .wav and .mp3 files (Untrimmed)
#        audio2ogg-trim       - Convert all .wav and .mp3 files & strip silence
#
#   2. Or run it directly from terminal:
#        bash scripts/audio-aliases.sh          # Batch convert (untrimmed)
#        bash scripts/audio-aliases.sh --trim   # Batch convert with silence trimmed
# ==============================================================================

# Ensure ffmpeg is available
_check_ffmpeg() {
    if ! command -v ffmpeg >/dev/null 2>&1; then
        echo "Error: ffmpeg is not installed or not in PATH." >&2
        return 1
    fi
    return 0
}

# Silence removal filter:
# Strips silence from the start (< -50dB), reverses audio, strips silence from the end, reverses back.
_SILENCE_FILTER="silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse"

# Convert a single file to .ogg
# Args: <input_file> [trim_flag: 0 or 1]
_convert_file_to_ogg() {
    local input="$1"
    local trim="${2:-0}"
    local output="${input%.*}.ogg"

    if [[ ! -f "$input" ]]; then
        echo "File not found: $input" >&2
        return 1
    fi

    if [[ "$input" == "$output" && "$trim" -eq 0 ]]; then
        echo "Skipping '$input': already an .ogg file."
        return 0
    fi

    local filter_args=()
    if [[ "$trim" -eq 1 ]]; then
        echo "Converting (trimming dead silence): '$input' -> '$output'..."
        filter_args=(-af "$_SILENCE_FILTER")
    else
        echo "Converting: '$input' -> '$output'..."
    fi

    ffmpeg -nostdin -v warning -stats -i "$input" "${filter_args[@]}" -c:a libvorbis -q:a 4 -y "$output"
    if [[ $? -eq 0 ]]; then
        echo "Done: '$output'"
    else
        echo "Failed to convert: '$input'" >&2
        return 1
    fi
}

# Convert .wav files (untrimmed - preserves exact loops & reverb tails)
wav2ogg() {
    _check_ffmpeg || return 1

    local trim=0
    local files=()

    for arg in "$@"; do
        if [[ "$arg" == "--trim" || "$arg" == "-t" ]]; then
            trim=1
        else
            files+=("$arg")
        fi
    done

    if [[ ${#files[@]} -gt 0 ]]; then
        for file in "${files[@]}"; do
            _convert_file_to_ogg "$file" "$trim"
        done
        return 0
    fi

    local prev_nullglob
    prev_nullglob="$(shopt -p nullglob || true)"
    shopt -s nullglob
    local wav_files=(*.wav *.WAV)
    eval "$prev_nullglob"

    if [[ ${#wav_files[@]} -eq 0 ]]; then
        echo "No .wav files found in $(pwd)"
        return 0
    fi

    echo "Found ${#wav_files[@]} WAV file(s) to convert..."
    for file in "${wav_files[@]}"; do
        _convert_file_to_ogg "$file" "$trim"
    done
}

# Convert .wav files with dead silence stripped (for one-shot SFX)
wav2ogg-trim() {
    wav2ogg --trim "$@"
}

# Convert .mp3 files (untrimmed - preserves exact loops)
mp32ogg() {
    _check_ffmpeg || return 1

    local trim=0
    local files=()

    for arg in "$@"; do
        if [[ "$arg" == "--trim" || "$arg" == "-t" ]]; then
            trim=1
        else
            files+=("$arg")
        fi
    done

    if [[ ${#files[@]} -gt 0 ]]; then
        for file in "${files[@]}"; do
            _convert_file_to_ogg "$file" "$trim"
        done
        return 0
    fi

    local prev_nullglob
    prev_nullglob="$(shopt -p nullglob || true)"
    shopt -s nullglob
    local mp3_files=(*.mp3 *.MP3)
    eval "$prev_nullglob"

    if [[ ${#mp3_files[@]} -eq 0 ]]; then
        echo "No .mp3 files found in $(pwd)"
        return 0
    fi

    echo "Found ${#mp3_files[@]} MP3 file(s) to convert..."
    for file in "${mp3_files[@]}"; do
        _convert_file_to_ogg "$file" "$trim"
    done
}

# Convert .mp3 files with dead silence stripped (for one-shot SFX)
mp32ogg-trim() {
    mp32ogg --trim "$@"
}

# Batch convert all .wav and .mp3 in current working directory
audio2ogg() {
    _check_ffmpeg || return 1
    local trim=0
    if [[ "$1" == "--trim" || "$1" == "-t" ]]; then
        trim=1
    fi

    echo "Scanning $(pwd) for .wav and .mp3 files (trim=$trim)..."
    if [[ "$trim" -eq 1 ]]; then
        wav2ogg --trim
        mp32ogg --trim
    else
        wav2ogg
        mp32ogg
    fi
    echo "Batch conversion finished."
}

# Batch convert all with silence trimmed
audio2ogg-trim() {
    audio2ogg --trim
}

# Set aliases / underscore variants
alias wav2ogg='wav2ogg'
alias wav2ogg_trim='wav2ogg-trim'
alias mp32ogg='mp32ogg'
alias mp32ogg_trim='mp32ogg-trim'
alias audio2ogg='audio2ogg'
alias audio2ogg_trim='audio2ogg-trim'

# If executed directly as a script (not sourced), run batch conversion on current dir
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    audio2ogg "$@"
else
    echo "Smackhem audio commands loaded into your shell:"
    echo "  wav2ogg        - Convert .wav file(s) (untrimmed, keeps loop points)"
    echo "  wav2ogg-trim   - Convert .wav file(s) and trim dead silence (SFX/UI)"
    echo "  mp32ogg        - Convert .mp3 file(s) (untrimmed, keeps loop points)"
    echo "  mp32ogg-trim   - Convert .mp3 file(s) and trim dead silence (SFX/UI)"
    echo "  audio2ogg      - Batch convert all .wav/.mp3 in current directory"
    echo "  audio2ogg-trim - Batch convert all and trim dead silence"
fi
