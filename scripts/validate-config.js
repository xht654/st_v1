#!/usr/bin/env node

import fs from 'fs';
import Joi from 'joi';

const configSchema = Joi.object({
    metadata: Joi.object({
        version: Joi.string().required(),
        lastUpdated: Joi.string(),
        description: Joi.string()
    }),
    sites: Joi.object().pattern(
        Joi.string(),
        Joi.object({
            name: Joi.string().required(),
            url: Joi.string().uri().required(),
            enabled: Joi.boolean().default(true),
            captureMethod: Joi.string().valid('simple', 'advanced').default('advanced'),
            referer: Joi.string().uri().optional(),
            priority: Joi.number().min(1).max(10).default(5),
            streamlink: Joi.object({
                quality: Joi.string().default('best'),
                retryStreams: Joi.number().min(1).max(10).default(3),
                retryMax: Joi.number().min(1).max(20).default(5),
                customArgs: Joi.string().default(''),
                useReferer: Joi.boolean().default(true)
            })
        })
    ),
    vpn: Joi.object({
        enabled: Joi.boolean().default(false),
        provider: Joi.string().valid('purevpn', 'openvpn').default('purevpn'),
        autoConnect: Joi.boolean().default(true)
    }),
    sessions: Joi.object({
        maxParallel: Joi.number().min(1).max(10).default(3)
    })
});

try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const { error } = configSchema.validate(config);
    
    if (error) {
        console.error('❌ Configuração inválida:', error.details[0].message);
        process.exit(1);
    } else {
        console.log('✅ Configuração válida');
        process.exit(0);
    }
} catch (err) {
    console.error('❌ Erro ao validar configuração:', err.message);
    process.exit(1);
}

