import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

class RecipeLineDto {
  @IsUUID('4')
  ingredientId!: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  quantity!: number;
}

export class CreateRecipeDto {
  @IsUUID('4')
  storeId!: string;

  @IsUUID('4')
  productId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}
