-- Recalc weight and effective_load for barbell/plate_loaded
UPDATE training_logs tl
SET
  weight = (
    CASE
      WHEN e.weight_type IN ('barbell', 'plate_loaded') AND COALESCE(e.simultaneous, false)
        THEN tl.input_wt * 2 + COALESCE(e.base_weight, 20)
      WHEN e.weight_type IN ('barbell', 'plate_loaded')
        THEN tl.input_wt + COALESCE(e.base_weight, 20)
      ELSE tl.weight
    END
  ),
  effective_load = (
    CASE
      WHEN e.weight_type IN ('barbell', 'plate_loaded') AND COALESCE(e.simultaneous, false)
        THEN tl.input_wt * 2 + COALESCE(e.base_weight, 20)
      WHEN e.weight_type IN ('barbell', 'plate_loaded')
        THEN tl.input_wt + COALESCE(e.base_weight, 20)
      ELSE tl.effective_load
    END
  )
FROM exercises e
WHERE tl.exercise_id = e.id
  AND e.weight_type IN ('barbell', 'plate_loaded')
  AND tl.input_wt IS NOT NULL;
