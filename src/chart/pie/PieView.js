define(function (require) {

    var graphic = require('../../util/graphic');
    var zrUtil = require('zrender/core/util');

    /**
     * @param {module:echarts/model/Series} seriesModel
     * @param {boolean} hasAnimation
     * @inner
     */
    function updateDataSelected(uid, seriesModel, hasAnimation, api) {
        var data = seriesModel.getData();
        var dataIndex = this.dataIndex;
        var name = data.getName(dataIndex);
        var selectedOffset = seriesModel.get('selectedOffset');

        api.dispatch({
            type: 'pieToggleSelect',
            from: uid,
            name: name,
            seriesName: seriesModel.name
        });

        data.each(function (idx) {
            toggleItemSelected(
                data.getItemGraphicEl(idx),
                data.getItemLayout(idx),
                seriesModel.isSelected(data.getName(idx)),
                selectedOffset,
                hasAnimation
            );
        });
    }

    /**
     * @param {module:zrender/graphic/Sector} el
     * @param {Object} layout
     * @param {boolean} isSelected
     * @param {number} selectedOffset
     * @param {boolean} hasAnimation
     * @inner
     */
    function toggleItemSelected(el, layout, isSelected, selectedOffset, hasAnimation) {
        var midAngle = (layout.startAngle + layout.endAngle) / 2;

        var dx = Math.cos(midAngle);
        var dy = Math.sin(midAngle);

        var offset = isSelected ? selectedOffset : 0;
        var position = [dx * offset, dy * offset];

        hasAnimation
            // animateTo will stop revious animation like update transition
            ? el.animate()
                .when(200, {
                    position: position
                })
                .start('bounceOut')
            : el.attr('position', position);
    }

    /**
     * Piece of pie including Sector, Label, LabelLine
     * @constructor
     * @extends {module:zrender/graphic/Group}
     */
    function PiePiece(data, idx, api) {

        graphic.Group.call(this);

        var sector = new graphic.Sector();
        var polyline = new graphic.Polyline();
        var text = new graphic.Text();
        this.add(sector);
        this.add(polyline);
        this.add(text);

        this.updateData(data, idx, api, true);

        function onEmphasis() {
            polyline.ignore = polyline.hoverIgnore;
            text.ignore = text.hoverIgnore;
        }
        function onNormal() {
            polyline.ignore = polyline.normalIgnore;
            text.ignore = text.normalIgnore;
        }
        this.on('emphasis', onEmphasis);
        this.on('normal', onNormal);
        this.on('mouseover', onEmphasis);
        this.on('mouseout', onNormal);
    }

    var piePieceProto = PiePiece.prototype;

    piePieceProto.updateData = function (data, idx, api, firstCreate) {

        var sector = this.childAt(0);
        var labelLine = this.childAt(1);
        var labelText = this.childAt(2);

        var seriesModel = data.hostModel;
        var itemModel = data.getItemModel(idx);
        var layout = data.getItemLayout(idx);
        var sectorShape = zrUtil.extend({}, layout);
        sectorShape.label = null;
        if (firstCreate) {
            sector.setShape(sectorShape);
            sector.shape.endAngle = layout.startAngle;
            api.updateGraphicEl(sector, {
                shape: {
                    endAngle: layout.endAngle
                }
            });
        }
        else {
            api.updateGraphicEl(sector, {
                shape: sectorShape
            });
        }

        var labelLayout = layout.label;

        api.updateGraphicEl(labelLine, {
            shape: {
                points: labelLayout.linePoints || [
                    [labelLayout.x, labelLayout.y], [labelLayout.x, labelLayout.y], [labelLayout.x, labelLayout.y]
                ]
            }
        });
        api.updateGraphicEl(labelText, {
            style: {
                x: labelLayout.x,
                y: labelLayout.y
            }
        });
        labelText.attr({
            style: {
                textAlign: labelLayout.textAlign,
                textBaseline: labelLayout.textBaseline,
                textFont: labelLayout.font
            },
            rotation: labelLayout.rotation,
            origin: [labelLayout.x, labelLayout.y],
            z2: 10
        });

        // Update common style
        var itemStyleModel = itemModel.getModel('itemStyle');
        var visualColor = data.getItemVisual(idx, 'color');

        sector.setStyle(
            zrUtil.extend(
                {
                    fill: visualColor
                },
                itemStyleModel.getModel('normal').getItemStyle()
            )
        );
        graphic.setHoverStyle(
            sector,
            itemStyleModel.getModel('emphasis').getItemStyle()
        );

        var labelModel = itemModel.getModel('label.normal');
        var labelHoverModel = itemModel.getModel('label.emphasis');
        var labelLineModel = itemModel.getModel('labelLine.normal');
        var labelLineHoverModel = itemModel.getModel('labelLine.emphasis');

        var textStyleModel = labelModel.getModel('textStyle');
        var labelPosition = labelModel.get('position');
        var isLabelInside = labelPosition === 'inside' || labelPosition === 'inner';

        labelText.setStyle({
            fill: textStyleModel.get('color')
                || isLabelInside ? '#fff' : visualColor,
            text: seriesModel.getFormattedLabel(idx, 'normal')
                || data.getName(idx),
            textFont: textStyleModel.getFont()
        });

        labelText.ignore = labelText.normalIgnore = !labelModel.get('show');
        labelText.hoverIgnore = !labelHoverModel.get('show');

        labelLine.ignore = labelLine.normalIgnore = !labelLineModel.get('show');
        labelLine.hoverIgnore = !labelLineHoverModel.get('show');

        // Default use item visual color
        labelLine.setStyle({
            stroke: visualColor
        });
        labelLine.setStyle(labelLineModel.getLineStyle());

        sector.setStyle(
            zrUtil.extend(
                {
                    fill: visualColor
                },
                itemStyleModel.getModel('normal').getItemStyle()
            )
        );
        sector.hoverStyle = itemStyleModel.getModel('emphasis').getItemStyle();
        labelText.hoverStyle = labelHoverModel.getModel('textStyle').getItemStyle();
        labelLine.hoverStyle = labelLineHoverModel.getLineStyle();

        graphic.setHoverStyle(this);

        // Toggle selected
        toggleItemSelected(
            this,
            data.getItemLayout(idx),
            itemModel.get('selected'),
            seriesModel.get('selectedOffset'),
            seriesModel.ecModel.get('animation')
        );
    };

    zrUtil.inherits(PiePiece, graphic.Group);


    // Pie view
    var Pie = require('../../view/Chart').extend({

        type: 'pie',

        init: function () {
            var sectorGroup = new graphic.Group();
            this._sectorGroup = sectorGroup;
        },

        render: function (seriesModel, ecModel, api, payload) {
            if (
                payload && (payload.from === this.uid
                || (payload.type === 'pieToggleSelect'
                    && payload.seriesName !== seriesModel.name))
            ) {
                return;
            }

            var data = seriesModel.getData();
            var oldData = this._data;
            var group = this.group;

            var hasAnimation = ecModel.get('animation');
            var isFirstRender = !oldData;

            var onSectorClick = zrUtil.curry(
                updateDataSelected, this.uid, seriesModel, hasAnimation, api
            );

            var selectedMode = seriesModel.get('selectedMode');

            data.diff(oldData)
                .add(function (idx) {
                    var piePiece = new PiePiece(data, idx, api);
                    if (isFirstRender) {
                        piePiece.eachChild(function (child) {
                            child.stopAnimation(true);
                        });
                    }

                    selectedMode && piePiece.on('click', onSectorClick);

                    data.setItemGraphicEl(idx, piePiece);

                    group.add(piePiece);
                })
                .update(function (newIdx, oldIdx) {
                    var piePiece = oldData.getItemGraphicEl(oldIdx);

                    piePiece.updateData(data, newIdx, api);

                    selectedMode
                        ? piePiece.on('click', onSectorClick)
                        : piePiece.off('click');
                    group.add(piePiece);
                    data.setItemGraphicEl(newIdx, piePiece);
                })
                .remove(function (idx) {
                    var piePiece = oldData.getItemGraphicEl(idx);
                    group.remove(piePiece);
                })
                .execute();

            if (hasAnimation && isFirstRender && data.count() > 0) {
                var shape = data.getItemLayout(0);
                var r = Math.max(api.getWidth(), api.getHeight()) / 2;

                var removeClipPath = zrUtil.bind(group.removeClipPath, group);
                group.setClipPath(this._createClipPath(
                    shape.cx, shape.cy, r, shape.startAngle, shape.clockwise, removeClipPath, api
                ));
            }

            this._data = data;
        },

        _createClipPath: function (
            cx, cy, r, startAngle, clockwise, cb, api
        ) {
            var clipPath = new graphic.Sector({
                shape: {
                    cx: cx,
                    cy: cy,
                    r0: 0,
                    r: r,
                    startAngle: startAngle,
                    endAngle: startAngle,
                    clockwise: clockwise
                }
            });

            api.initGraphicEl(clipPath, {
                shape: {
                    endAngle: startAngle + (clockwise ? 1 : -1) * Math.PI * 2
                }
            }, cb);

            return clipPath;
        }
    });

    return Pie;
});