import chalk from 'chalk';
import { DiagnosticResult } from './diagnostics';
import * as fs from 'fs';
import * as path from 'path';

export class Reporter {
  formatDiagnosticResults(results: DiagnosticResult[]): string {
    let output = chalk.bold.underline('Diagnostic Results:\n\n');
    
    results.forEach(result => {
      const statusColor = 
        result.status === 'success' ? chalk.green :
        result.status === 'warning' ? chalk.yellow :
        chalk.red;
      
      output += statusColor(`[${result.status.toUpperCase()}] ${result.name}\n`);
      output += '--------------------------------\n';
      output += this.formatCommandOutput(result.output);
      output += '\n\n';
    });
    
    return output;
  }
  
  formatActionResult(name: string, output: string): string {
    let result = chalk.bold.underline(`Action: ${name}\n\n`);
    result += this.formatCommandOutput(output);
    return result;
  }
  
  formatCommandOutput(output: string): string {
    // Split output into lines and add line numbers
    return output.split('\n')
      .map((line, index) => `${chalk.dim(`${index + 1}`.padStart(4))} | ${line}`)
      .join('\n');
  }
  
  saveReportToFile(reportData: any, fileName?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportName = fileName || `diagnostic-report-${timestamp}.json`;
    const reportsDir = path.join(process.cwd(), 'reports');
    
    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, reportName);
    
    // Serialize report data
    const reportContent = JSON.stringify(reportData, null, 2);
    fs.writeFileSync(reportPath, reportContent);
    
    return reportPath;
  }
  
  generateHtmlReport(reportData: any, fileName?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportName = fileName || `diagnostic-report-${timestamp}.html`;
    const reportsDir = path.join(process.cwd(), 'reports');
    
    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, reportName);
    
    // Generate HTML content
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Server Diagnostic Report</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }
        h1, h2, h3 {
          margin-top: 24px;
          margin-bottom: 16px;
        }
        .result-card {
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 20px;
          overflow: hidden;
        }
        .result-header {
          padding: 12px 15px;
          font-weight: bold;
          border-bottom: 1px solid #ddd;
        }
        .success { background-color: #e6ffec; }
        .warning { background-color: #fffbdd; }
        .error { background-color: #ffebe9; }
        .result-content {
          padding: 15px;
          background-color: #f6f8fa;
          white-space: pre-wrap;
          overflow-x: auto;
          font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
          font-size: 12px;
        }
        .timestamp {
          color: #666;
          font-size: 14px;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <h1>Server Diagnostic Report</h1>
      <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
    `;
    
    if (reportData.systemInfo) {
      htmlContent += `
        <h2>System Information</h2>
        <div class="result-card">
          <div class="result-content">${reportData.systemInfo}</div>
        </div>
      `;
    }
    
    if (reportData.diagnostics && reportData.diagnostics.length > 0) {
      htmlContent += `<h2>Diagnostic Results</h2>`;
      
      reportData.diagnostics.forEach((result: DiagnosticResult) => {
        htmlContent += `
          <div class="result-card">
            <div class="result-header ${result.status}">${result.name} [${result.status.toUpperCase()}]</div>
            <div class="result-content">${result.output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        `;
      });
    }
    
    if (reportData.troubleshooting && Object.keys(reportData.troubleshooting).length > 0) {
      htmlContent += `<h2>Troubleshooting Actions</h2>`;
      
      Object.entries(reportData.troubleshooting).forEach(([name, output]: [string, any]) => {
        htmlContent += `
          <div class="result-card">
            <div class="result-header">${name}</div>
            <div class="result-content">${String(output).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        `;
      });
    }
    
    htmlContent += `
    </body>
    </html>
    `;
    
    fs.writeFileSync(reportPath, htmlContent);
    
    return reportPath;
  }
}