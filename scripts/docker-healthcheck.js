#!/usr/bin/env node

import http from 'http';
import fs from 'fs';

const HEALTH_CHECKS = [
  {
    name: 'API',
    url: 'http://localhost:3001/api/status',
    critical: true
  },
  {
    name: 'Stream Server',
    url: 'http://localhost:8080/status',
    critical: false
  },
  {
    name: 'Config File',
    check: () => fs.existsSync('/app/config.json'),
    critical: true
  }
];

async function performHealthCheck() {
  const results = [];
  
  for (const check of HEALTH_CHECKS) {
    try {
      if (check.url) {
        // HTTP health check
        const isHealthy = await checkUrl(check.url);
        results.push({
          name: check.name,
          healthy: isHealthy,
          critical: check.critical
        });
      } else if (check.check) {
        // Custom check function
        const isHealthy = check.check();
        results.push({
          name: check.name,
          healthy: isHealthy,
          critical: check.critical
        });
      }
    } catch (error) {
      results.push({
        name: check.name,
        healthy: false,
        critical: check.critical,
        error: error.message
      });
    }
  }
  
  return results;
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
  });
}

async function main() {
  try {
    const results = await performHealthCheck();
    
    const criticalFailures = results.filter(r => r.critical && !r.healthy);
    const allHealthy = results.every(r => r.healthy);
    
    // Log results
    results.forEach(result => {
      const status = result.healthy ? '✅' : '❌';
      const critical = result.critical ? '[CRITICAL]' : '[OPTIONAL]';
      console.log(`${status} ${critical} ${result.name}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    if (criticalFailures.length > 0) {
      console.log(`\n❌ Health check failed: ${criticalFailures.length} critical failure(s)`);
      process.exit(1);
    } else if (allHealthy) {
      console.log('\n✅ All health checks passed');
      process.exit(0);
    } else {
      console.log('\n⚠️ Some optional checks failed, but system is operational');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    process.exit(1);
  }
}

main();

