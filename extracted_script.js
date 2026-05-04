
        const appData = {}; /* truncated */

                        }
                    }
                }
            }
            
            // 2순위: 입력 구조 + 완선경(근사) + 강종
            if (!candidates.length && appData.struct_dia_grade_to_middle) {
                const baseStruct = removeCoating(normalizedInput);
                const keys = Object.keys(appData.struct_dia_grade_to_middle);
                for (const key of keys) {
                    const parts = key.split('|');
                    if (parts.length !== 3) continue;
                    
                    const keyStruct = parts[0];
                    const keyDia = parseFloat(parts[1]);
                    const keyGrade = parts[2];
                    
                    if (keyStruct === baseStruct && keyGrade === grade) {
                        const diff = Math.abs(keyDia - wireDia);
                        if (diff < 0.15) {
                            candidates.push({
                                priority: 2,
                                diff: diff,
                                value: appData.struct_dia_grade_to_middle[key]
                            });
                        }
                    }
                }
            }
            
            // 3순위: 도금 + 강종
            if (!candidates.length && coating && appData.struct_coating_grade_to_middle) {
                const baseStruct = removeCoating(normalizedInput);
                const key = baseStruct + '|' + coating + '|' + grade;
                if (appData.struct_coating_grade_to_middle[key]) {
                    candidates.push({
                        priority: 3,
                        diff: 0,
                        value: appData.struct_coating_grade_to_middle[key]
                    });
                }
            }
            
            // 4순위: 소선경(근사) + 강종
            if (!candidates.length && appData.dia_grade_to_middle) {
                const keys = Object.keys(appData.dia_grade_to_middle);
                for (const key of keys) {
                    const parts = key.split('|');
                    if (parts.length !== 2) continue;
                    
                    const keyDia = parseFloat(parts[0]);
                    const keyGrade = parts[1];
                    
                    if (keyGrade === grade) {
                        const diff = Math.abs(keyDia - wireDia);
                        if (diff < 0.15) {
                            candidates.push({
                                priority: 4,
                                diff: diff,
                                value: appData.dia_grade_to_middle[key]
                            });
                        }
                    }
                }
            }
            
            // 가장 좋은 매칭 선택 (우선순위 높은 것, 차이 작은 것)
            if (candidates.length > 0) {
                candidates.sort((a, b) => {
                    if (a.priority !== b.priority) return a.priority - b.priority;
                    return a.diff - b.diff;
                });
                return candidates[0].value;
            }
            
            return null;
        }

        function getTsForWire(struct, wireDia, grade) {
            const baseStruct = removeCoating(struct);
            const ts_mappings = appData.struct_dia_grade_to_ts || {};
            
            let bestKey = null;
            let bestDiff = 999;
            
            for (const key in ts_mappings) {
                const parts = key.split('|');
                if (parts.length !== 3) continue;
                
                const keyStruct = parts[0];
                const keyDia = parseFloat(parts[1]);
                const keyGrade = parts[2];
                
                if (keyStruct === baseStruct && keyGrade === grade) {
                    const diff = Math.abs(keyDia - wireDia);
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestKey = key;
                    }
                }
            }
            
            if (bestKey && bestDiff < 0.3) {
                return ts_mappings[bestKey];
            }
            return null;
        }

        function addMsg(text, type) {
            const msg = document.getElementById('msg');
            const p = document.createElement('p');
            p.className = 'msg ' + type;
            p.innerHTML = text;
            msg.appendChild(p);
        }

        function clearMsg() {
            document.getElementById('msg').innerHTML = '';
        }

        function toggleAccordion(element) {
            element.classList.toggle('collapsed');
            const body = element.nextElementSibling;
            body.classList.toggle('collapsed');
        }

        function analyze() {
            clearMsg();
            const input = document.getElementById('input').value.trim();
            const lines = input.split('\n').filter(l => l.trim());
            const orders = [];

            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length < 7) {
                    addMsg('❌ 형식 오류 (7개 필드 필요): ' + line, 'error');
                    continue;
                }

                const dia = parseFloat(parts[0]);
                let inputStruct = parts[1].trim();
                const ts = parts[4].trim();
                const weight = parseFloat(parts[6]);

                if (isNaN(dia) || isNaN(weight)) {
                    addMsg('❌ 숫자 파싱 실패: ' + line, 'error');
                    continue;
                }

                let struct = inputStruct;
                let coating = extractCoating(struct);
                let coreType = extractCoreType(struct);
                let isEpp = isEppCore(struct);

                if (struct.endsWith('+I') && !struct.endsWith('+IWRC')) {
                    struct = struct.replace('+I', '+IWRC');
                }

                if (appData.structure_mapping && appData.structure_mapping[struct]) {
                    const mapped = appData.structure_mapping[struct];
                    addMsg('✓ 매핑: ' + inputStruct + ' → ' + mapped, 'info');
                    struct = mapped;
                }

                if (!appData.final_design_map[struct]) {
                    addMsg('❌ 설계 없음: ' + struct, 'error');
                    continue;
                }

                const grade = getTsGrade(struct, ts);
                
                orders.push({ dia, struct, inputStruct, ts, weight, coating, coreType, grade, isEpp });
                const coatingStr = coating ? ' (' + coating + ')' : '';
                const coreStr = ' [' + coreType + ']';
                addMsg('✓ ' + inputStruct + coatingStr + coreStr + ' (DIA ' + dia + 'mm, TS ' + ts + ' → ' + grade + ', ' + weight + 'kg)', 'success');
            }

            if (orders.length === 0) {
                addMsg('❌ 유효한 데이터가 없습니다', 'error');
                return;
            }

            addMsg('✓ ' + orders.length + '개 항목 처리', 'success');

            const allRecs = {};
            const productDetails = {};

            for (const o of orders) {
                const wires = appData.final_design_map[o.struct];
                const dr = appData.dr_ratio_map[o.struct] || 0.89;

                let totalRatio = 0;
                const wireData = {};

                for (const d in wires) {
                    if (o.isEpp && ['d6', 'd7', 'd11', 'd12'].includes(d)) {
                        continue;
                    }

                    const w = wires[d];
                    const wireDia = o.dia * dr * w.coeff;
                    const ratio = wireDia * wireDia * w.st_count * w.wire_count;
                    wireData[d] = { wireDia, ratio, st_count: w.st_count, wire_count: w.wire_count };
                    totalRatio += ratio;
                }

                const productKey = o.inputStruct + '|' + o.ts;

                if (!productDetails[productKey]) {
                    productDetails[productKey] = {
                        struct: o.inputStruct,
                        mappedStruct: o.struct,
                        grade: o.grade,
                        ts: o.ts,
                        dia: o.dia,
                        coating: o.coating,
                        coreType: o.coreType,
                        wires: []
                    };
                }

                for (const d in wireData) {
                    const wd = wireData[d];
                    const wireWeight = (wd.ratio / totalRatio) * o.weight;
                    const midWire = findMiddleWire(wd.wireDia, o.grade, o.inputStruct, o.coating, o.struct);
                    const wireTs = getTsForWire(o.struct, wd.wireDia, o.grade);

                    productDetails[productKey].wires.push({
                        d,
                        wireDia: wd.wireDia,
                        stCount: wd.st_count,
                        wireCount: wd.wire_count,
                        wireWeight,
                        midWire,
                        grade: o.grade,
                        wireTs: wireTs
                    });

                    if (midWire) {
                        const midNorm = normalizeMiddleWire(midWire);
                        const coatingDisplay = o.coating ? o.coating : '-';
                        const key = o.grade + '|Φ' + midNorm + 'mm|' + coatingDisplay + '|' + o.ts;
                        if (!allRecs[key]) {
                            allRecs[key] = { weight: 0, ts: o.ts, grade: o.grade };
                        }
                        allRecs[key].weight += wireWeight;
                    }
                }
            }

            lastResultData = { allRecs, productDetails };

            const recsG = {};
            const recsU = {};

            for (const key in allRecs) {
                const [grade, diaSpec, coating, ts] = key.split('|');
                if (coating === 'G') {
                    recsG[key] = allRecs[key];
                } else if (coating === 'U') {
                    recsU[key] = allRecs[key];
                }
            }

            let gHtml = '';
            if (Object.keys(recsG).length > 0) {
                gHtml = '<div class="coating-header coating-g-header">🟠 도금(G) 중간선</div>';
                gHtml += '<table><thead><tr><th>중간선 규격</th><th>선경(mm)</th><th>필요량(kg)</th></tr></thead><tbody>';
                
                const sortedG = Object.entries(recsG)
                    .map(([key, data]) => {
                        const diaStr = key.match(/Φ([\d.]+)mm/)[1];
                        return {
                            key: key,
                            spec: data.grade + ' Φ' + diaStr + 'mm',
                            grade: data.grade,
                            dia: parseFloat(diaStr),
                            weight: data.weight,
                            ts: data.ts
                        };
                    })
                    .sort((a, b) => a.dia - b.dia);
                
                let totalG = 0;
                for (const rec of sortedG) {
                    totalG += rec.weight;
                    gHtml += '<tr><td><strong>' + rec.spec + '</strong></td><td>' + rec.dia.toFixed(2) + '</td><td>' + rec.weight.toFixed(2) + '</td></tr>';
                }
                gHtml += '<tr style="background: #fff3e0; font-weight: bold;"><td colspan="2">소계</td><td>' + totalG.toFixed(2) + '</td></tr></tbody></table>';
            }

            let uHtml = '';
            if (Object.keys(recsU).length > 0) {
                uHtml = '<div class="coating-header coating-u-header">🟣 비도금(U) 중간선</div>';
                uHtml += '<table><thead><tr><th>중간선 규격</th><th>선경(mm)</th><th>필요량(kg)</th></tr></thead><tbody>';
                
                const sortedU = Object.entries(recsU)
                    .map(([key, data]) => {
                        const diaStr = key.match(/Φ([\d.]+)mm/)[1];
                        return {
                            key: key,
                            spec: data.grade + ' Φ' + diaStr + 'mm',
                            grade: data.grade,
                            dia: parseFloat(diaStr),
                            weight: data.weight,
                            ts: data.ts
                        };
                    })
                    .sort((a, b) => a.dia - b.dia);
                
                let totalU = 0;
                for (const rec of sortedU) {
                    totalU += rec.weight;
                    uHtml += '<tr><td><strong>' + rec.spec + '</strong></td><td>' + rec.dia.toFixed(2) + '</td><td>' + rec.weight.toFixed(2) + '</td></tr>';
                }
                uHtml += '<tr style="background: #f3e5f5; font-weight: bold;"><td colspan="2">소계</td><td>' + totalU.toFixed(2) + '</td></tr></tbody></table>';
            }

            document.getElementById('coatingGSection').innerHTML = gHtml;
            document.getElementById('coatingUSection').innerHTML = uHtml;

            const detailBody = document.getElementById('detailBody');
            detailBody.innerHTML = '';

            for (const pkey in productDetails) {
                const p = productDetails[pkey];
                const coatingStr = p.coating ? '(도금 ' + p.coating + ')' : '(비도금)';
                const coreStr = ' [' + p.coreType + ']';
                
                const itemId = 'accordion-' + Math.random().toString(36).substr(2, 9);
                
                let html = '<div class="accordion-item">';
                html += '<div class="accordion-header collapsed" onclick="toggleAccordion(this)" id="' + itemId + '">';
                html += '📦 ' + p.struct + ' ' + coatingStr + coreStr + ' | DIA ' + p.dia + 'mm | TS ' + p.ts + ' | 강종 ' + p.grade;
                html += '</div>';
                
                html += '<div class="accordion-body collapsed">';
                html += '<table class="subtable">';
                html += '<thead><tr><th>소선(d)</th><th>소선경(mm)</th><th>ST수</th><th>소선수</th><th>무게(kg)</th><th>중간선</th><th>소선 TS</th></tr></thead>';
                html += '<tbody>';

                let productTotal = 0;
                for (const w of p.wires) {
                    const midNorm = w.midWire ? normalizeMiddleWire(w.midWire) : null;
                    const midStr = midNorm ? w.grade + ' Φ' + midNorm + 'mm' : '-';
                    const tsStr = w.wireTs ? 'TS ' + w.wireTs : '-';
                    html += '<tr><td>' + w.d + '</td><td>' + w.wireDia.toFixed(3) + '</td><td>' + w.stCount + '</td><td>' + w.wireCount + '</td><td>' + w.wireWeight.toFixed(2) + '</td><td>' + midStr + '</td><td>' + tsStr + '</td></tr>';
                    productTotal += w.wireWeight;
                }

                html += '<tr class="total-row"><td colspan="5">소계</td><td></td><td>' + productTotal.toFixed(2) + '</td></tr>';
                html += '</tbody></table>';
                html += '</div></div>';

                detailBody.innerHTML += html;
            }

            document.getElementById('result').classList.remove('hidden');
            document.getElementById('excelBtn').style.display = 'block';
        }

        function exportToExcel() {
            if (!lastResultData) {
                alert('먼저 분석하기를 클릭하세요');
                return;
            }

            const { allRecs } = lastResultData;

            const excelData = [];
            excelData.push(['강종', '중간선 규격', '도금', '선경(mm)', '필요량(kg)']);

            const recsG = [];
            const recsU = [];

            for (const key in allRecs) {
                const [grade, diaSpec, coating, ts] = key.split('|');
                const diaStr = diaSpec.replace('Φ', '').replace('mm', '');
                const dia = parseFloat(diaStr);
                const weight = allRecs[key].weight;

                const row = [grade, diaStr, coating, dia.toFixed(2), parseFloat(weight.toFixed(2))];

                if (coating === 'G') {
                    recsG.push(row);
                } else {
                    recsU.push(row);
                }
            }

            recsG.sort((a, b) => a[3] - b[3]);
            recsU.sort((a, b) => a[3] - b[3]);

            for (const row of recsG) {
                excelData.push(row);
            }

            let totalG = 0;
            for (const row of recsG) {
                totalG += row[4];
            }
            excelData.push(['', '', 'G 소계', '', totalG.toFixed(2)]);

            excelData.push([]);

            for (const row of recsU) {
                excelData.push(row);
            }

            let totalU = 0;
            for (const row of recsU) {
                totalU += row[4];
            }
            excelData.push(['', '', 'U 소계', '', totalU.toFixed(2)]);

            excelData.push([]);
            excelData.push(['', '', '합계', '', (totalG + totalU).toFixed(2)]);

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);

            ws['!cols'] = [
                { wch: 10 },
                { wch: 15 },
                { wch: 10 },
                { wch: 12 },
                { wch: 15 }
            ];

            XLSX.utils.book_append_sheet(wb, ws, '중간선');

            const today = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, '중간선_필요량_' + today + '.xlsx');
        }
    