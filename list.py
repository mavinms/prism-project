import os
from collections import defaultdict
import datetime

def format_size(size_bytes):
    """Converts bytes to a human-readable format (KB, MB, GB)."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"

def create_file_report(directory):
    """
    Scans the directory and generates a detailed report.
    """
    # 1. Extensions to IGNORE (Similar to common .gitignore)
    IGNORED_EXTENSIONS = {
        '.log', '.zip', '.tar', '.rar', '.mp4', '.mov', '.pdf', '.psd',
        '.ai', '.exe', '.dll', '.so', '.o', '.pyc', '.git', '.DS_Store',
        '.db', '.lock', '.tmp'
    }
    
    # 2. Data structures for the report
    report = defaultdict(lambda: {'count': 0, 'size': 0, 'is_large': False})
    large_files = [] 
    total_trackable_size = 0
    LARGE_FILE_THRESHOLD = 10 * 1024 * 1024 # 10 Megabytes

    print(f"Scanning directory: {directory}...")

    # 3. Walk through all files and subdirectories
    for root, dirs, files in os.walk(directory):
        # Prevent scanning Git directories and common large dependency folders
        if '.git' in dirs: dirs.remove('.git')
        if 'node_modules' in dirs: dirs.remove('node_modules')
        if 'venv' in dirs: dirs.remove('venv')
        if '__pycache__' in dirs: dirs.remove('__pycache__')

        for file in files:
            file_path = os.path.join(root, file)
            
            # Skip the script itself and the report file
            if file in ('file_report_generator.py', 'prism_file_report.txt'):
                continue
            
            try:
                size = os.path.getsize(file_path)
                _, ext = os.path.splitext(file)
                ext = ext.lower()

                if ext in IGNORED_EXTENSIONS:
                    report['[IGNORED_FILES]']['count'] += 1
                    report['[IGNORED_FILES]']['size'] += size
                    continue
                
                report[ext]['count'] += 1
                report[ext]['size'] += size
                total_trackable_size += size

                if size >= LARGE_FILE_THRESHOLD:
                    report[ext]['is_large'] = True
                    large_files.append((file_path, size))
                
            except OSError as e:
                print(f"Could not access {file_path}: {e}")
                
    return report, total_trackable_size, large_files

def write_report_to_file(report_data, overall_size, large_files, directory, report_file_name="prism_file_report.txt"):
    """Writes the formatted report to a text file."""
    
    sorted_report = sorted(report_data.items(), key=lambda item: item[1]['size'], reverse=True)
    
    with open(report_file_name, 'w', encoding='utf-8') as f:
        f.write("=================================================================\n")
        f.write("== PRISM PROJECT FILE SCAN REPORT FOR GIT ANALYSIS ==\n")
        f.write(f"== Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ==\n")
        f.write("=================================================================\n\n")

        # --- 1. Summary ---
        f.write("## 1. SUMMARY OF PROJECT SIZE ##\n")
        f.write("-----------------------------------------------------------------\n")
        
        ignored_size = report_data.get('[IGNORED_FILES]', {'size': 0})['size']
        f.write(f"  Total Size of **TRACKABLE** Code/Text Files (Recommended for Git): {format_size(overall_size)}\n")
        f.write(f"  Total Size of **IGNORED** Binary/Large/Temp Files: {format_size(ignored_size)}\n")
        f.write("-----------------------------------------------------------------\n\n")

        # --- 2. Extension Breakdown Table ---
        f.write("## 2. FILE TYPE EXTENSION BREAKDOWN ##\n")
        f.write(" (Sorted by size, largest file types first)\n")
        f.write("-----------------------------------------------------------------\n")
        
        ext_width = max(len(ext) for ext in report_data.keys()) if report_data else 10
        count_width = 8
        size_width = 15
        lfs_width = 10

        header = f"| {'Extension'.ljust(ext_width)} | {'Count'.center(count_width)} | {'Total Size'.center(size_width)} | {'LFS Needed'.center(lfs_width)} |"
        f.write(header + "\n")
        f.write(f"|{'-'*(ext_width+2)}|{'-'*(count_width+2)}|{'-'*(size_width+2)}|{'-'*(lfs_width+2)}|\n")
        
        for ext, data in sorted_report:
            lfs_status = 'YES' if data['is_large'] and ext != '[IGNORED_FILES]' else 'No'
            
            # Corrected 'ljust' typo
            f.write(f"| {ext.ljust(ext_width)} | {str(data['count']).rjust(count_width)} | {format_size(data['size']).rjust(size_width)} | {lfs_status.center(lfs_width)} |\n")
        
        f.write("-----------------------------------------------------------------\n\n")

        # --- 3. List of Explicitly Large Files ---
        f.write("## 3. LARGE FILES (>= 10MB) LIST ##\n")
        f.write(" (These files should be tracked using **Git LFS** if they are needed)\n")
        f.write("-----------------------------------------------------------------\n")
        
        if large_files:
            sorted_large_files = sorted(large_files, key=lambda item: item[1], reverse=True)
            for path, size in sorted_large_files:
                # Correct use of 'directory'
                relative_path = os.path.relpath(path, start=directory) 
                f.write(f"{format_size(size).rjust(15)} | {relative_path}\n")
        else:
            f.write("No individual files found exceeding the 10MB LFS threshold.\n")
            
        f.write("-----------------------------------------------------------------\n")
        
    print(f"\n✅ Report successfully saved to: {os.path.abspath(report_file_name)}")
    print("Please copy the content of this file and paste it into the chat for analysis.")


if __name__ == "__main__":
    target_directory = os.getcwd() 
    
    # Run the scan
    report_data, overall_size, large_files = create_file_report(target_directory)

    # Correct use of 'target_directory' as argument
    write_report_to_file(report_data, overall_size, large_files, target_directory)