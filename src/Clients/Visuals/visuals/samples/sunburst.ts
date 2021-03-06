﻿/// <reference path="../../_references.ts"/>

module powerbi.visuals.samples {
    import SelectionManager = utility.SelectionManager;
    export interface SunburstSlice {
        children?: SunburstSlice[];
        value?: any;
        color?: string;
        name?: string;
        parent?: SunburstSlice;
        selector: SelectionId;
        total: number;
        tooltipInfo?: TooltipDataItem[];
    }

    export interface SunburstViewModel {
        root: SunburstSlice;
    }

    export var sunburstRoleNames = {
        nodes: 'Nodes',
        values: 'Values',
    };

    export class Sunburst implements IVisual {
        private static minOpacity = 0.2;
        private svg: D3.Selection;
        private g: D3.Selection;
        private arc: D3.Svg.Arc;
        private total: number = 0;
        private viewport: IViewport;
        private colors: IDataColorPalette;
        private selectionManager: SelectionManager;
      
        private static roleNames = {
            nodes: 'Nodes',
            values: 'Values',
        };

        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: Sunburst.roleNames.nodes,
                    kind: VisualDataRoleKind.Grouping,
                    displayName: 'Groups'
                }, {
                    name: Sunburst.roleNames.values,
                    kind: VisualDataRoleKind.Measure,
                    displayName: 'Values'
                }
            ],
            objects: {
                general: {
                    displayName: data.createDisplayNameGetter('Visual_General'),
                    properties: {
                        formatString: {
                            type: { formatting: { formatString: true } },
                        },
                    },
                },
            },
            dataViewMappings: [{
                conditions: [
                    { 'Groups': { min: 0 }, 'Values': { max: 1 } },
                ],
                matrix: {
                    rows: {
                        for: { in: Sunburst.roleNames.nodes },
                    },
                    values: {                      
                        for: { in: Sunburst.roleNames.values } 
                    },
                }
            }],
        };

        public init(options: VisualInitOptions): void {
            this.arc = d3.svg.arc()
                .startAngle(function (d) { return d.x; })
                .endAngle(function (d) { return d.x + d.dx; })
                .innerRadius(function (d) { return Math.sqrt(d.y); })
                .outerRadius(function (d) { return Math.sqrt(d.y + d.dy); });

            this.colors = options.style.colorPalette.dataColors;
            this.selectionManager = new SelectionManager({ hostServices: options.host });
            this.svg = d3.select(options.element.get(0)).append('svg');
            this.svg.classed('mainDrawArea',true);
            this.g = this.svg.append('g');
            this.g.classed("container", true);
            this.svg.append("text")
                .classed("sunBurstPercentageFixed", true);

            this.svg.on('mousedown', (d) => {
                this.svg.selectAll("path").style("opacity", 1);
                this.svg.select(".sunBurstPercentageFixed").style("opacity", 0);
                this.selectionManager.clear();
            });
        }

        private static setAllUnhide(selection): void {
            selection.attr("setUnHide", "true");
        }

        public update(options: VisualUpdateOptions): void {
            if (options.dataViews.length > 0) {
                let data = this.converter(options.dataViews[0], this.colors);
                this.viewport = options.viewport;
                this.updateInternal(data);
            }
        }
        
        private updateInternal(dataRootNode: SunburstSlice): void {
            this.svg.attr({
                'height': this.viewport.height,
                'width': this.viewport.width
            });
            this.g.attr('transform', SVGUtil.translate(this.viewport.width / 2, this.viewport.height / 2));
            let radius = Math.min(this.viewport.width, this.viewport.height) / 2;
            let partition = d3.layout.partition()
                .size([2 * Math.PI, radius * radius])
                .value((d) => { return d.value; });
            let path = this.g.datum(dataRootNode).selectAll("path")
                .data(partition.nodes);
            path.enter().append("path");
            path.attr("display", (d) => { return d.depth ? null : "none"; })
                .attr("d", this.arc)
                .style("stroke", "#fff")
                .style("fill", (d) => { return d.color; })
                .style("fill-rule", "evenodd")
                .on("mousedown", (d) => {
                    if (d.selector) {
                        this.selectionManager.select(d.selector);
                    }
                    d3.selectAll("path").call(Sunburst.setAllUnhide).attr('setUnHide', null);
                    this.highlightPath(d, this, true);
                    let percentageFixedText = this.svg.select(".sunBurstPercentageFixed");
                    var percentage = this.total === 0 ? 0 : (100 * d.total / this.total).toPrecision(3);
                    percentageFixedText.text(d ? percentage + "%" : "");
                    percentageFixedText.style("fill", d.color);
                    this.onResize();
                    event.stopPropagation();
                });
            this.renderTooltip(path);
            path.exit().remove();
            
            this.onResize();
        }

        // Get all parents of the node
        private static getTreePath(node) {
            let path = [];
            let current = node;
            while (current.parent) {
                path.unshift(current);
                current = current.parent;
            }
            return path;
        }

        private onResize(): void {
            let width = this.viewport.width;
            let height = this.viewport.height;
            let percentageFixedText = this.svg.select(".sunBurstPercentageFixed");
            percentageFixedText.style("opacity", 1);
            percentageFixedText.attr("y", (height / 2));
            percentageFixedText.attr("x", ((width / 2) - (percentageFixedText.node().clientWidth / 2)));
        }

        private highlightPath(d, sunBurst, setUnhide): void {
            let parentsArray = d ? Sunburst.getTreePath(d) : [];
            // Set opacity for all the segments.
            sunBurst.svg.selectAll("path").each(function () {
                if (d3.select(this).attr('setUnHide') !== 'true') {
                    d3.select(this).style("opacity", Sunburst.minOpacity);
                }
            });
            // Highlight only ancestors of the current segment.
            sunBurst.svg.selectAll("path")
                .filter(function (node) {
                    return (parentsArray.indexOf(node) >= 0);
                }).each(function () {
                    d3.select(this).style("opacity", 1);
                    if (setUnhide === true) {
                        d3.select(this).attr('setUnHide', 'true');
                    }
                });
        }

        private renderTooltip(selection: D3.UpdateSelection): void {
            TooltipManager.addTooltip(selection, (tooltipEvent: TooltipEvent) => {
                return (<SunburstSlice>tooltipEvent.data).tooltipInfo;
            });
        }

        private static getTooltipData(displayName: string, value: number): TooltipDataItem[] {
            return [{
                displayName: displayName,
                value: value < 0 ? "" : value.toString()
            }];
        }

        private covertTreeNodeToSunBurstNode(originParentNode: DataViewTreeNode, sunburstParentNode: SunburstSlice,
            colors: IColorScale, pathIdentity: DataViewScopeIdentity[], color): SunburstSlice {
            var selector: powerbi.data.Selector;
            if (originParentNode.identity) {
                pathIdentity = pathIdentity.concat([originParentNode.identity]);
                selector = { data: pathIdentity, };
            }

            let selectionId = pathIdentity.length === 0 ? null : new SelectionId(selector, false);
            var valueToSet = originParentNode.values ? originParentNode.values[0].value : 0;
            
            let newSunNode: SunburstSlice = {
                name: originParentNode.name,
                value: Math.max(valueToSet, 0),
                selector: selectionId,
                key: selectionId ? selectionId.getKey() : null,
                total: valueToSet
            };
            if (originParentNode.value) {
                newSunNode.color = color ? color : colors.getColor(originParentNode.value).value;
            }
            this.total += newSunNode.value;
            if (originParentNode.children && originParentNode.children.length > 0) {

                newSunNode.tooltipInfo = Sunburst.getTooltipData(originParentNode.value, -1);

                newSunNode.children = [];
                for (let i = 0; i < originParentNode.children.length; i++) {
                    var newChild = this.covertTreeNodeToSunBurstNode(originParentNode.children[i], newSunNode, colors, pathIdentity, newSunNode.color);
                    newSunNode.children.push(newChild);
                    newSunNode.total += newChild.total;
                }
            } else {
                newSunNode.tooltipInfo = Sunburst.getTooltipData(originParentNode.value, valueToSet);
            }
            if (sunburstParentNode) {
                newSunNode.parent = sunburstParentNode;
            }

            return newSunNode;
        }

        public converter(dataView: DataView, colors: IDataColorPalette): SunburstSlice{
            var colorScale = colors.getNewColorScale();
            this.total = 0;
            let root: SunburstSlice = this.covertTreeNodeToSunBurstNode(dataView.matrix.rows.root, null, colorScale, [], undefined);

            return root;
        }
    }
}